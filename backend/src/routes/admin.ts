/**
 * ============================================================================
 * 🛰️ SUPERADMIN CONSOLE (Delpat-only)
 * ============================================================================
 * The platform surface that sits ABOVE all tenants. Guarded by a superadmin
 * token backed by a session (12 hours, revocable, services/auth.ts), never by
 * a firm's token.
 *
 *   GET  /overview                    every firm, with what tells us it is alive
 *   GET  /firms/:id                   one firm: team, sessions, logins, work,
 *                                     alerts reachability, storage
 *   POST /firms/:id/support           open its desk, read only, for two hours
 *   POST /firms/:id/users/:uid/sign-out
 *   POST /firms/:id/users/:uid/reset-password   a new password, shown once
 *   GET  /firms/:id/audit             its ledger, paged and filtered, and checked
 *   GET  /platform/audit              Delpat's own events (logins, onboarding)
 *   POST /logout
 *   POST /onboard/preview, /onboard   a new firm
 *
 * Everything the console does to a firm is written to THAT firm's ledger,
 * as the superadmin, by name.
 * ============================================================================
 */

import { Router, Request, Response, NextFunction } from 'express';
import { verifyToken, superadminSessionAlive, signToken, SUPPORT_HOURS, suggestPassword, adminSetPassword, revokeUserSessions } from '../services/auth.js';
import { audit, verifyChain, verifyTenantLedger, listLedger } from '../services/audit.js';
import { sql } from '../services/db.js';
import { provisionTenant } from '../services/store.js';
import { planRoster } from '../services/roster.js';
import { prefixUsage } from '../services/media.js';
import { randomBytes } from 'crypto';

export const adminRouter = Router();

async function requireSuperadmin(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const claims = token ? verifyToken(token) : null;
  // A token is not enough: its session must be live. Old 30-day tokens carry
  // no session and are refused, which signs the console out once.
  if (!claims || claims.kind !== 'superadmin' || !(await superadminSessionAlive(claims.jti))) {
    return res.status(401).json({ error: 'Superadmin authentication required' });
  }
  const [sa] = await sql`SELECT id, email, name FROM superadmins WHERE id = ${claims.superadmin_id} LIMIT 1`;
  if (!sa) return res.status(401).json({ error: 'Superadmin authentication required' });
  (req as any).superadmin = { ...claims, name: sa.name || sa.email };
  next();
}

adminRouter.use(requireSuperadmin);

const saOf = (req: Request) => (req as any).superadmin;
const ctxOf = (req: Request) => ({ ip: req.ip || req.socket?.remoteAddress || null, user_agent: (req.headers['user-agent'] as string) || null });

/** Write to a firm's ledger as the superadmin, by name. */
function firmAudit(req: Request, tenantId: string, action: string, summary: string, target?: { type: string; id: string }, metadata: any = {}) {
  const sa = saOf(req);
  return audit({
    tenant_id: tenantId, actor_type: 'superadmin', actor_id: sa.superadmin_id, actor_label: sa.name,
    action, target_type: target?.type || 'tenant', target_id: target?.id || tenantId, summary, metadata, ...ctxOf(req),
  });
}

async function firmOr404(req: Request, res: Response) {
  const [t] = await sql`SELECT * FROM tenants WHERE id = ${req.params.id} LIMIT 1`;
  if (!t) { res.status(404).json({ error: 'No such firm' }); return null; }
  return t;
}

adminRouter.post('/logout', async (req: Request, res: Response) => {
  const jti = saOf(req).jti;
  await sql`UPDATE sessions SET revoked = TRUE WHERE id = ${jti}`;
  audit({ tenant_id: null, actor_type: 'superadmin', actor_id: saOf(req).superadmin_id, actor_label: saOf(req).name,
    action: 'auth.logout', target_type: 'superadmin', target_id: saOf(req).superadmin_id, summary: `${saOf(req).name} (superadmin) signed out`, ...ctxOf(req) });
  res.json({ success: true });
});

/**
 * Every firm, and what says whether it is alive: its people, its book, and
 * when anybody last did anything. The ledger's health is on each firm's page.
 */
adminRouter.get('/overview', async (_req: Request, res: Response) => {
  try {
    const tenants = await sql`
      SELECT t.id, t.name, t.slug, t.subscription_plan, t.subscription_status, t.created_at,
        (SELECT count(*)::int FROM users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL AND lower(u.status) <> 'suspended') AS users,
        (SELECT count(*)::int FROM crm_leads l WHERE l.tenant_id = t.id) AS leads,
        (SELECT count(*)::int FROM crm_owners o WHERE o.tenant_id = t.id) AS owners,
        (SELECT count(*)::int FROM crm_properties p WHERE p.tenant_id = t.id) AS properties,
        (SELECT count(*)::int FROM crm_leads l WHERE l.tenant_id = t.id AND l.created_at > NOW() - INTERVAL '7 days') AS leads_7d,
        (SELECT max(e.timestamp) FROM crm_timeline_events e WHERE e.tenant_id = t.id
           AND coalesce(e.author, 'System') NOT IN ('System', 'Import')) AS last_work,
        (SELECT max(s.last_seen_at) FROM sessions s WHERE s.tenant_id = t.id AND s.support_by IS NULL) AS last_seen
      FROM tenants t ORDER BY t.created_at ASC NULLS FIRST`;
    return res.json({ success: true, tenants });
  } catch (err: any) {
    return res.status(500).json({ error: 'Overview failed', message: err.message });
  }
});

/**
 * One firm. Who can sign in and whether they are stuck (locked, still on the
 * password they were handed, never signed in), where they are signed in, the
 * last logins and failures, whether work is happening and leads are arriving,
 * who can be reached by an alert, and what the firm keeps in storage.
 */
adminRouter.get('/firms/:id', async (req: Request, res: Response) => {
  const t = await firmOr404(req, res); if (!t) return;
  try {
    const id = t.id;
    const [counts, team, sessions, logins, sources, worked, usage] = await Promise.all([
      sql`SELECT
            (SELECT count(*)::int FROM crm_leads WHERE tenant_id = ${id}) AS leads,
            (SELECT count(*)::int FROM crm_leads WHERE tenant_id = ${id} AND created_at > NOW() - INTERVAL '7 days') AS leads_7d,
            (SELECT count(*)::int FROM crm_owners WHERE tenant_id = ${id}) AS owners,
            (SELECT count(*)::int FROM crm_properties WHERE tenant_id = ${id}) AS properties,
            (SELECT count(*)::int FROM crm_agreements WHERE tenant_id = ${id}) AS agreements`,
      sql`SELECT u.id, u.name, u.role, u.login_id, u.email, u.phone, u.status, u.must_change_password,
                 u.locked_until, u.failed_logins, u.created_at,
                 -- The later of a recorded sign-in and a session's start: sessions
                 -- from before sign-ins were written to the ledger prove one too.
                 greatest(
                   (SELECT max(a.created_at) FROM audit_log a WHERE a.tenant_id = ${id} AND a.action = 'auth.login' AND a.actor_id = u.id),
                   (SELECT max(s.created_at) FROM sessions s WHERE s.user_id = u.id AND s.support_by IS NULL)) AS last_login,
                 (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id AND s.revoked = FALSE AND s.expires_at > NOW() AND s.support_by IS NULL) AS live_sessions,
                 (SELECT count(*)::int FROM push_subscriptions p WHERE p.tenant_id = ${id} AND p.user_id = u.id) AS devices,
                 (SELECT max(d.created_at) FROM push_deliveries d WHERE d.tenant_id = ${id} AND d.user_id = u.id AND d.status IN ('sent', 'displayed')) AS last_alert_ok,
                 (SELECT count(*)::int FROM push_deliveries d WHERE d.tenant_id = ${id} AND d.user_id = u.id AND d.status = 'failed' AND d.created_at > NOW() - INTERVAL '7 days') AS alerts_failed_7d
            FROM users u WHERE u.tenant_id = ${id} AND u.deleted_at IS NULL
           ORDER BY (u.role = 'owner') DESC, lower(u.status) = 'suspended', u.name`,
      sql`SELECT s.id, s.user_id, u.name, s.created_at, s.last_seen_at, s.expires_at, s.ip, s.user_agent, s.support_by
            FROM sessions s LEFT JOIN users u ON u.id = s.user_id
           WHERE s.tenant_id = ${id} AND s.revoked = FALSE AND s.expires_at > NOW()
           ORDER BY s.last_seen_at DESC LIMIT 100`,
      sql`SELECT seq, action, actor_id, actor_label, ip, user_agent, created_at FROM audit_log
           WHERE tenant_id = ${id} AND action IN ('auth.login', 'auth.login_failed')
           ORDER BY seq DESC LIMIT 40`,
      sql`SELECT coalesce(nullif(source, ''), 'Not stated') AS source, count(*)::int AS n_7d, max(created_at) AS last_at
            FROM crm_leads WHERE tenant_id = ${id} GROUP BY 1 ORDER BY max(created_at) DESC NULLS LAST LIMIT 20`,
      sql`SELECT e.author AS user_id, count(*)::int AS actions, max(e.timestamp) AS last_at
            FROM crm_timeline_events e
           WHERE e.tenant_id = ${id} AND e.timestamp > NOW() - INTERVAL '7 days'
             AND coalesce(e.author, 'System') NOT IN ('System', 'Import')
           GROUP BY 1`,
      prefixUsage(`${id}/`).catch(() => null),
    ]);
    // Leads in the last 7 days per source (the query above counts all time).
    const src7 = await sql`SELECT coalesce(nullif(source, ''), 'Not stated') AS source, count(*)::int AS n
      FROM crm_leads WHERE tenant_id = ${id} AND created_at > NOW() - INTERVAL '7 days' GROUP BY 1`;
    const byS = new Map((src7 as any[]).map(r => [r.source, r.n]));
    return res.json({
      success: true,
      tenant: { id: t.id, name: t.name, slug: t.slug, plan: t.subscription_plan, status: t.subscription_status, created_at: t.created_at },
      counts: counts[0], team, sessions, logins,
      sources: (sources as any[]).map(r => ({ source: r.source, last_at: r.last_at, n_7d: byS.get(r.source) || 0 })),
      worked, storage: usage,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Could not read the firm', message: err.message });
  }
});

/**
 * OPEN THE FIRM'S DESK, READ ONLY (decided 25 Sep: read only, always allowed).
 * A session as the firm's owner, marked with who opened it, two hours and not
 * extended; every write it attempts is refused by middleware/auth.ts. Opening
 * it is written to the firm's own ledger.
 */
adminRouter.post('/firms/:id/support', async (req: Request, res: Response) => {
  const t = await firmOr404(req, res); if (!t) return;
  const [owner] = await sql`SELECT id, name FROM users WHERE tenant_id = ${t.id} AND role = 'owner' AND deleted_at IS NULL
                             ORDER BY (lower(status) = 'active') DESC, created_at LIMIT 1`;
  if (!owner) return res.status(422).json({ error: 'This firm has no owner account to open the desk as.' });
  const sa = saOf(req);
  const jti = `sess_sup_${Date.now()}_${randomBytes(9).toString('base64url')}`;
  const [row] = await sql`
    INSERT INTO sessions (id, tenant_id, user_id, expires_at, ip, user_agent, support_by)
    VALUES (${jti}, ${t.id}, ${owner.id}, NOW() + make_interval(hours => ${SUPPORT_HOURS}), ${ctxOf(req).ip}, ${ctxOf(req).user_agent}, ${sa.superadmin_id})
    RETURNING expires_at`;
  const token = signToken({ kind: 'user', tenant_id: t.id, user_id: owner.id, role: 'owner', jti, sup: sa.name }, `${SUPPORT_HOURS}h`);
  firmAudit(req, t.id, 'support.open', `${sa.name} (Delpat) opened the desk, read only, for ${SUPPORT_HOURS} hours`, { type: 'session', id: jti });
  return res.json({ success: true, token, slug: t.slug || t.id, expiresAt: row.expires_at, owner: { id: owner.id, name: owner.name }, by: sa.name });
});

adminRouter.post('/firms/:id/users/:uid/sign-out', async (req: Request, res: Response) => {
  const t = await firmOr404(req, res); if (!t) return;
  const [u] = await sql`SELECT id, name FROM users WHERE id = ${req.params.uid} AND tenant_id = ${t.id} LIMIT 1`;
  if (!u) return res.status(404).json({ error: 'No such person in this firm' });
  await revokeUserSessions(u.id);
  firmAudit(req, t.id, 'session.revoked_all', `${saOf(req).name} (Delpat) signed ${u.name} out everywhere`, { type: 'user', id: u.id });
  return res.json({ success: true });
});

/** A new password for one person, must be changed at next sign-in, shown once. */
adminRouter.post('/firms/:id/users/:uid/reset-password', async (req: Request, res: Response) => {
  const t = await firmOr404(req, res); if (!t) return;
  const [u] = await sql`SELECT id, name, login_id, email, role FROM users WHERE id = ${req.params.uid} AND tenant_id = ${t.id} AND deleted_at IS NULL LIMIT 1`;
  if (!u) return res.status(404).json({ error: 'No such person in this firm' });
  const password = suggestPassword();
  await adminSetPassword(t.id, u.id, password, true);
  firmAudit(req, t.id, 'user.password_reset', `${saOf(req).name} (Delpat) reset ${u.name}'s password`, { type: 'user', id: u.id });
  return res.json({ success: true, password, loginWith: u.role === 'agent' ? (u.login_id || u.email) : (u.email || u.login_id) });
});

/** The firm's ledger, newest first, and whether it is whole. */
adminRouter.get('/firms/:id/audit', async (req: Request, res: Response) => {
  const t = await firmOr404(req, res); if (!t) return;
  const q = req.query as any;
  try {
    const [page, check] = await Promise.all([
      listLedger({ tenantId: t.id, before: Number(q.before) || null, action: q.action || null, actor: q.actor || null, from: q.from || null, to: q.to || null }),
      verifyTenantLedger(t.id),
    ]);
    return res.json({ success: true, ...page, check });
  } catch (err: any) {
    return res.status(500).json({ error: 'Could not read the ledger', message: err.message });
  }
});

/** Delpat's own events: console logins, onboarding. */
adminRouter.get('/platform/audit', async (req: Request, res: Response) => {
  const q = req.query as any;
  try {
    const [page, own, legacy] = await Promise.all([
      listLedger({ tenantId: null, before: Number(q.before) || null, action: q.action || null, actor: q.actor || null, from: q.from || null, to: q.to || null }),
      verifyChain('platform'), verifyChain('legacy'),
    ]);
    return res.json({ success: true, ...page, check: { ok: own.ok && legacy.ok, own, legacy } });
  } catch (err: any) {
    return res.status(500).json({ error: 'Could not read the ledger', message: err.message });
  }
});

/**
 * POST /api/v1/admin/onboard/preview — the login ids and passwords this roster
 * would be created with, so the console can show them while it is being typed.
 * Writes nothing. Rows that already carry an id and password come back as sent.
 */
adminRouter.post('/onboard/preview', (req: Request, res: Response) => {
  const { ownerName, ownerEmail, ownerPassword, team } = req.body || {};
  return res.json({ success: true, ...planRoster({ ownerName, ownerEmail, ownerPassword, team }) });
});

/**
 * POST /api/v1/admin/onboard — provision a new consultancy workspace.
 * Superadmin-only (guarded by adminRouter.use above). This is the ONE place a
 * workspace is created; the public /workspace/onboard route was removed so a
 * visitor on the login page can no longer spin up tenants.
 */
adminRouter.post('/onboard', async (req: Request, res: Response) => {
  const sa = (req as any).superadmin;
  try {
    const {
      firmName, city, slug, adminName, ownerName, adminEmail, ownerEmail,
      adminPhone, ownerPhone, primaryColor, ownerPassword, mustChangePassword, initialTeam
    } = req.body || {};

    const result = await provisionTenant({
      firmName, city, slug,
      ownerName: ownerName || adminName,
      ownerEmail: ownerEmail || adminEmail,
      ownerPhone: ownerPhone || adminPhone,
      primaryColor,
      ownerPassword,
      mustChangePassword,
      initialTeam,
    });
    audit({
      tenant_id: result.tenant.id, actor_type: 'superadmin', actor_id: sa?.superadmin_id || null,
      actor_label: sa?.name || sa?.email || 'superadmin', action: 'tenant.provisioned',
      target_type: 'tenant', target_id: result.tenant.id,
      summary: `Provisioned workspace '${result.tenant.name}' (owner ${result.owner.email})`,
      metadata: { slug: result.tenant.slug },
    });
    return res.status(201).json({ success: true, message: `Workspace '${result.tenant.name}' provisioned.`, ...result });
  } catch (err: any) {
    const msg = err?.message || 'Provisioning failed';
    const isValidation = /required|email|Roster is not valid/i.test(msg);
    return res.status(isValidation ? 400 : 500).json({ success: false, error: isValidation ? 'Invalid workspace details' : 'Provisioning failed', message: msg });
  }
});

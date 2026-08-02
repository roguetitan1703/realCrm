/**
 * ============================================================================
 * 🛰️ SUPERADMIN CONSOLE (Delpat-only)
 * ============================================================================
 * The platform surface that sits ABOVE all tenants. Guarded by a superadmin
 * JWT (email+password login), never by the tenant OTP token. Minimal for now:
 * a roster of tenants with headline counts and the health of the audit ledger.
 * Fuller provisioning lands in a later slice.
 * ============================================================================
 */

import { Router, Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth.js';
import { verifyAuditChain, audit } from '../services/audit.js';
import { sql } from '../services/db.js';
import { provisionTenant } from '../services/store.js';

export const adminRouter = Router();

function requireSuperadmin(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const claims = token ? verifyToken(token) : null;
  if (!claims || claims.kind !== 'superadmin') {
    return res.status(401).json({ error: 'Superadmin authentication required' });
  }
  (req as any).superadmin = claims;
  next();
}

adminRouter.use(requireSuperadmin);

adminRouter.get('/overview', async (_req: Request, res: Response) => {
  try {
    const tenants = await sql`
      SELECT
        t.id, t.name, t.slug, t.subscription_plan, t.subscription_status, t.created_at,
        (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id = t.id)             AS users,
        (SELECT COUNT(*)::int FROM crm_leads l WHERE l.tenant_id = t.id)         AS leads,
        (SELECT COUNT(*)::int FROM crm_properties p WHERE p.tenant_id = t.id)    AS properties
      FROM tenants t
      ORDER BY t.created_at ASC NULLS FIRST
    `;
    const chain = await verifyAuditChain();
    const countRow = await sql`SELECT COUNT(*)::int AS n FROM audit_log`;
    const recent = await sql`
      SELECT seq, tenant_id, actor_type, actor_label, action, summary, created_at
      FROM audit_log ORDER BY seq DESC LIMIT 12
    `;
    return res.json({
      success: true,
      tenants,
      audit: {
        ok: chain.ok,
        brokenAtSeq: chain.brokenAtSeq ?? null,
        count: countRow[0].n,
        recent,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Overview failed', message: err.message });
  }
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
      actor_label: sa?.email || 'superadmin', action: 'tenant.provisioned',
      target_type: 'tenant', target_id: result.tenant.id,
      summary: `Provisioned workspace '${result.tenant.name}' (owner ${result.owner.email})`,
      metadata: { slug: result.tenant.slug },
    });
    return res.status(201).json({ success: true, message: `Workspace '${result.tenant.name}' provisioned.`, ...result });
  } catch (err: any) {
    const msg = err?.message || 'Provisioning failed';
    const isValidation = /required|email/i.test(msg);
    return res.status(isValidation ? 400 : 500).json({ success: false, error: isValidation ? 'Invalid workspace details' : 'Provisioning failed', message: msg });
  }
});

/**
 * ============================================================================
 * 🔐 AUTH ROUTES
 * ============================================================================
 *   POST /api/v1/auth/otp/request|verify                 → 410, retired
 *   POST /api/v1/auth/superadmin/login { email, password } → superadmin token
 *   GET  /api/v1/auth/me                                 → who the token is
 *
 * Tenant for the OTP flow is resolved from the X-Tenant-ID header (the login
 * screen has selected a workspace). Once a token is issued, EVERY other route
 * takes tenant from the token, not the header.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import {
  superadminLogin, verifyToken, getUserById, publicUser, DEFAULT_TENANT_ID,
  passwordLogin, changePassword, requestPasswordReset, resetPassword,
  revokeSession, listSessions,
} from '../services/auth.js';
import type { TenantTokenClaims } from '../services/auth.js';
import { sql } from '../services/db.js';
import { requirePhone, phoneInvalidBody } from '../services/phone.js';
import { localeOf } from '../services/store.js';
import { audit } from '../services/audit.js';
import { hit } from '../services/rateLimit.js';

export const authRouter = Router();

function tenantFromHeader(req: Request): string {
  return (req.headers['x-tenant-id'] as string) || DEFAULT_TENANT_ID;
}

/**
 * The workspace a sign-in is FOR. No default.
 *
 * tenantFromHeader falls back to DEFAULT_TENANT_ID, which is the demo tenant.
 * On a read that is merely wrong; on a login it means a request that forgot to
 * say which firm it belongs to gets its credentials checked against the demo
 * workspace — and answered "Invalid credentials", because the account lives
 * somewhere else. A person with the correct password is told it is wrong, and
 * nothing in the response hints at the real reason.
 *
 * Say so instead.
 */
function tenantForLogin(req: Request): string | null {
  const t = (req.headers['x-tenant-id'] as string || '').trim();
  return t || null;
}

function reqCtx(req: Request) {
  return { ip: req.ip || req.socket?.remoteAddress || null, userAgent: (req.headers['user-agent'] as string) || null };
}

/**
 * PER-ADDRESS LIMITS on the public auth doors. There were none: a script
 * could try passwords as fast as the server answered (the per-account lockout
 * only slows one account at a time), and forgot-password could mail an inbox
 * without end. The numbers are set so a whole office behind one address never
 * meets them: 30 sign-ins a minute is a person every two seconds.
 */
const SLOW_AUTH = { error: 'slow_down', message: 'Too many attempts. Try again in a few minutes.' };
const ipKey = (req: Request) => req.ip || req.socket?.remoteAddress || 'unknown';

/** Read + verify the bearer token, returning tenant-user claims (or null). */
function userClaims(req: Request): TenantTokenClaims | null {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const claims = token ? verifyToken(token) : null;
  return claims && claims.kind === 'user' ? claims : null;
}

// PHONE/EMAIL CODE SIGN-IN IS RETIRED (specs/auth.md). No screen used it, yet
// both endpoints stayed public with no rate limit, a 4-digit code with no
// attempt cap, DEMO_OTP's "unknown number signs in as the owner", and a 30-day
// token with no session behind it, so it could not be revoked. Gone, not fixed.
authRouter.post(['/otp/request', '/otp/verify'], (_req: Request, res: Response) =>
  res.status(410).json({ error: 'retired', message: 'Sign in with your ID and password.' }));

// ── Password auth (auth v2) ─────────────────────────────────────────────────
// Tenant comes from the selected-workspace header (login is pre-token). The
// handle is an email (owner/manager) or an assigned login_id (agent).
authRouter.post('/login', async (req: Request, res: Response) => {
  if (!hit(`auth-login:${ipKey(req)}`, 30, 60_000)) return res.status(429).json(SLOW_AUTH);
  try {
    const { handle, identifier, password } = req.body || {};
    const h = handle || identifier;
    if (!h || !password) return res.status(400).json({ error: 'handle and password are required' });
    const tenant = tenantForLogin(req);
    if (!tenant) return res.status(400).json({ error: 'No workspace selected', message: 'Open your workspace URL and sign in there.' });
    const out = await passwordLogin(tenant, h, password, reqCtx(req));
    if ('error' in out) return res.status(401).json({ error: 'Invalid credentials' });
    return res.status(200).json({ success: true, token: out.token, user: out.user, mustChange: out.mustChange });
  } catch (err: any) {
    return res.status(500).json({ error: 'Login failed', message: err.message });
  }
});

authRouter.post('/logout', async (req: Request, res: Response) => {
  const claims = userClaims(req);
  if (claims?.jti) { try { await revokeSession(claims.jti); } catch { /* best effort */ } }
  return res.status(200).json({ success: true });
});

authRouter.post('/password/change', async (req: Request, res: Response) => {
  const claims = userClaims(req);
  if (!claims) return res.status(401).json({ error: 'Not authenticated' });
  const { current, next } = req.body || {};
  if (!current || !next) return res.status(400).json({ error: 'current and next are required' });
  const out = await changePassword(claims.tenant_id, claims.user_id, current, next, claims.jti);
  if ('error' in out) return res.status(400).json({ error: out.error });
  return res.status(200).json({ success: true });
});

// Always 200 (no account enumeration) whether or not the email maps to a user.
authRouter.post('/password/forgot', async (req: Request, res: Response) => {
  if (!hit(`auth-forgot:${ipKey(req)}`, 10, 10 * 60_000)) return res.status(429).json(SLOW_AUTH);
  try {
    // `handle` is what the sign-in form calls it; `email` is what this endpoint
    // used to be. Both accepted so an older deployed client keeps working —
    // the frontend ships on push and the API by hand, so the two are routinely
    // a few commits apart.
    const { email, handle } = req.body || {};
    const identifier = handle || email;
    // Build the reset link from where the request actually came from, so the
    // emailed link points back to THIS app — localhost in dev, the app origin in
    // the split-origin deploy (the browser's Origin is the app, not the API host).
    const origin = (req.headers.origin as string) || `${req.protocol}://${req.get('host')}`;
    // NOT AWAITED. The lookup and the email ran inside the request, so a real
    // account answered measurably slower than an unknown one. Flooding is
    // bounded in requestPasswordReset (one live link, a new one at most every
    // 10 minutes).
    if (identifier) {
      requestPasswordReset(tenantFromHeader(req), identifier, origin)
        .catch((err: any) => console.warn('[Auth] forgot-password error:', err?.message));
    }
  } catch (err: any) {
    console.warn('[Auth] forgot-password error:', err.message);
  }
  return res.status(200).json({ success: true });
});

authRouter.post('/password/reset', async (req: Request, res: Response) => {
  const { token, next } = req.body || {};
  if (!token || !next) return res.status(400).json({ error: 'token and next are required' });
  const out = await resetPassword(tenantFromHeader(req), token, next);
  if ('error' in out) return res.status(400).json({ error: out.error });
  return res.status(200).json({ success: true });
});

// Active sessions for the caller (the "where am I logged in" view).
authRouter.get('/sessions', async (req: Request, res: Response) => {
  const claims = userClaims(req);
  if (!claims) return res.status(401).json({ error: 'Not authenticated' });
  const sessions = await listSessions(claims.user_id);
  return res.status(200).json({ success: true, sessions, current: claims.jti || null });
});

authRouter.post('/sessions/:id/revoke', async (req: Request, res: Response) => {
  const claims = userClaims(req);
  if (!claims) return res.status(401).json({ error: 'Not authenticated' });
  // Only revoke a session that belongs to the caller.
  const mine = await listSessions(claims.user_id);
  if (!mine.some((s: any) => s.id === req.params.id)) return res.status(404).json({ error: 'Session not found' });
  await revokeSession(req.params.id);
  return res.status(200).json({ success: true });
});

authRouter.post('/superadmin/login', async (req: Request, res: Response) => {
  // Tighter: one person signs in here, and it reaches every firm.
  if (!hit(`auth-sa:${ipKey(req)}`, 10, 60_000)) return res.status(429).json(SLOW_AUTH);
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    const out = await superadminLogin(email, password, reqCtx(req));
    if (!out) return res.status(401).json({ error: 'Invalid credentials' });
    return res.status(200).json({ success: true, token: out.token, superadmin: out.superadmin });
  } catch (err: any) {
    return res.status(500).json({ error: 'Login failed', message: err.message });
  }
});

authRouter.get('/me', async (req: Request, res: Response) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const claims = token ? verifyToken(token) : null;
  if (!claims) return res.status(401).json({ error: 'Not authenticated' });

  if (claims.kind === 'superadmin') {
    return res.status(200).json({ success: true, kind: 'superadmin', email: claims.email });
  }
  const u = await getUserById(claims.tenant_id, claims.user_id);
  if (!u) return res.status(401).json({ error: 'User no longer exists' });
  return res.status(200).json({ success: true, kind: 'user', tenant_id: claims.tenant_id, user: publicUser(u) });
});

/**
 * PATCH /api/v1/auth/me { phone } — my own mobile number.
 *
 * Sending homes needs the sender's number on file, because the buyer's
 * WhatsApp opens to it (listing-pages.md §A.4); an agent without one is asked
 * for it in place, once. The Team screen's edit is for owners and managers
 * changing other people, so it could not serve here. Stored as exact E.164
 * (docs/specs/phone.md); one number per person in a firm (idx_users_tenant_phone).
 */
authRouter.patch('/me', async (req: Request, res: Response) => {
  const u = req.user as any;
  if (!u?.id || !u?.tenant_id) return res.status(401).json({ error: 'Not authenticated' });
  // /auth/me is open to a must-change-password token so it can say who it is;
  // that token may read, not write.
  if ((userClaims(req) as any)?.mc) return res.status(403).json({ error: 'Change your password first.' });
  let phone: string | null;
  try {
    phone = requirePhone(req.body?.phone, (await localeOf(u.tenant_id)).country);
  } catch (e) {
    const body = phoneInvalidBody(e);
    if (body) return res.status(422).json(body);
    throw e;
  }
  if (!phone) return res.status(422).json({ success: false, error: 'phone_invalid', reason: 'empty', message: 'Enter your mobile number.' });
  try {
    // The exact number, and deleted users too: the unique index
    // (idx_users_tenant_phone) counts them, so a number a removed member still
    // holds would otherwise surface as a 500.
    const clash = await sql`SELECT 1 FROM users WHERE tenant_id = ${u.tenant_id} AND id <> ${u.id}
      AND phone = ${phone} LIMIT 1`;
    if (clash.length) return res.status(409).json({ error: 'phone_taken', message: 'Someone on this team already uses that number.' });
    const [before] = await sql`SELECT phone FROM users WHERE tenant_id = ${u.tenant_id} AND id = ${u.id} LIMIT 1`;
    try {
      await sql`UPDATE users SET phone = ${phone}, metadata = coalesce(metadata, '{}'::jsonb) || ${sql.json({ phone })}
                 WHERE tenant_id = ${u.tenant_id} AND id = ${u.id}`;
    } catch (e: any) {
      // Two people saving the same number at once: the index decides.
      if (e?.code === '23505') return res.status(409).json({ error: 'phone_taken', message: 'Someone on this team already uses that number.' });
      throw e;
    }
    await sql`UPDATE crm_agents SET metadata = coalesce(metadata, '{}'::jsonb) || ${sql.json({ phone })}
               WHERE tenant_id = ${u.tenant_id} AND id = ${u.id}`;
    audit({
      tenant_id: u.tenant_id, actor_type: 'user', actor_id: u.id, actor_label: null, action: 'user.phone_changed',
      target_type: 'user', target_id: u.id, summary: 'Changed their own mobile number',
      metadata: { from: before?.phone || null, to: phone },
      ip: req.ip || null, user_agent: (req.headers['user-agent'] as string) || null,
    });
    const fresh = await getUserById(u.tenant_id, u.id);
    return res.status(200).json({ success: true, user: fresh ? publicUser(fresh) : null });
  } catch (err: any) {
    return res.status(500).json({ error: 'Could not save the number', message: err.message });
  }
});

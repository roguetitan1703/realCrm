/**
 * ============================================================================
 * 🔐 AUTH ROUTES
 * ============================================================================
 *   POST /api/v1/auth/otp/request   { phone }            → issue phone OTP
 *   POST /api/v1/auth/otp/verify    { phone, code }      → tenant-user token
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
  issueOtp, verifyOtp, superadminLogin, verifyToken, getUserById, publicUser, DEFAULT_TENANT_ID,
  passwordLogin, changePassword, requestPasswordReset, resetPassword,
  revokeSession, listSessions,
} from '../services/auth.js';
import type { TenantTokenClaims } from '../services/auth.js';

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

/** Read + verify the bearer token, returning tenant-user claims (or null). */
function userClaims(req: Request): TenantTokenClaims | null {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const claims = token ? verifyToken(token) : null;
  return claims && claims.kind === 'user' ? claims : null;
}

authRouter.post('/otp/request', async (req: Request, res: Response) => {
  try {
    // Accept a phone or an email under any of these keys (phone kept for back-compat).
    const { phone, email, identifier } = req.body || {};
    const id = identifier || email || phone;
    if (!id) return res.status(400).json({ error: 'phone or email is required' });
    const out = await issueOtp(tenantFromHeader(req), id);
    // demoCode is only present when DEMO_OTP=true. `delivery` tells the client how
    // (or whether) the code reached the user: 'email', 'demo' (on screen), 'sms',
    // or 'none' (no channel — the client should surface that, not advance).
    // `sentTo` is a masked hint (e.g. jy••••@gmail.com) when delivered by email.
    return res.status(200).json({ success: true, sent: out.sent, demoCode: out.demoCode, delivery: out.delivery, sentTo: out.sentTo });
  } catch (err: any) {
    return res.status(500).json({ error: 'OTP request failed', message: err.message });
  }
});

authRouter.post('/otp/verify', async (req: Request, res: Response) => {
  try {
    const { phone, email, identifier, code } = req.body || {};
    const id = identifier || email || phone;
    if (!id || !code) return res.status(400).json({ error: 'identifier and code are required' });
    const out = await verifyOtp(tenantFromHeader(req), id, code, reqCtx(req));
    if (!out) return res.status(401).json({ error: 'Invalid or expired code' });
    return res.status(200).json({ success: true, token: out.token, user: out.user });
  } catch (err: any) {
    return res.status(500).json({ error: 'OTP verify failed', message: err.message });
  }
});

// ── Password auth (auth v2) ─────────────────────────────────────────────────
// Tenant comes from the selected-workspace header (login is pre-token). The
// handle is an email (owner/manager) or an assigned login_id (agent).
authRouter.post('/login', async (req: Request, res: Response) => {
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
  try {
    const { email } = req.body || {};
    // Build the reset link from where the request actually came from, so the
    // emailed link points back to THIS app — localhost in dev, the app origin in
    // the split-origin deploy (the browser's Origin is the app, not the API host).
    const origin = (req.headers.origin as string) || `${req.protocol}://${req.get('host')}`;
    if (email) await requestPasswordReset(tenantFromHeader(req), email, origin);
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

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
} from '../services/auth.js';

export const authRouter = Router();

function tenantFromHeader(req: Request): string {
  return (req.headers['x-tenant-id'] as string) || DEFAULT_TENANT_ID;
}

function reqCtx(req: Request) {
  return { ip: req.ip || req.socket?.remoteAddress || null, userAgent: (req.headers['user-agent'] as string) || null };
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

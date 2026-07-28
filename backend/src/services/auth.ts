/**
 * ============================================================================
 * 🔐 AUTH SERVICE — tokens, phone OTP, superadmin password
 * ============================================================================
 * Two audiences, two mechanisms, one token format:
 *   • Tenant users (owner/manager/agent) log in by PHONE OTP.
 *   • Superadmins (Delpat staff) log in by EMAIL + PASSWORD.
 * Both receive a signed JWT; downstream middleware trusts the token, never the
 * client-supplied X-Tenant-ID header.
 * ============================================================================
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { sql, DEFAULT_TENANT_ID } from './db.js';
import { audit } from './audit.js';
import { emailConfigured, sendOtpEmail } from './email.js';

export interface RequestCtx {
  ip?: string | null;
  userAgent?: string | null;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const TOKEN_TTL = '30d';
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
// Demo mode returns the OTP in the response so a live demo never waits on an
// SMS. Off by default; turn on with DEMO_OTP=true.
const DEMO_OTP = process.env.DEMO_OTP === 'true';

export interface TenantTokenClaims {
  kind: 'user';
  tenant_id: string;
  user_id: string;
  role: string;
}
export interface SuperadminTokenClaims {
  kind: 'superadmin';
  superadmin_id: string;
  email: string;
}
export type TokenClaims = TenantTokenClaims | SuperadminTokenClaims;

export function signToken(claims: TokenClaims): string {
  return jwt.sign(claims, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): TokenClaims | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenClaims;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phone OTP (tenant users)
// ---------------------------------------------------------------------------

function normalizePhone(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits ? `+91${digits.slice(-10)}` : '';
}

function isEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw || '').trim());
}

/** One key for the OTP challenge whether the user gave a phone or an email, so
 *  the same auth_otp row is looked up on verify. Emails are lowercased; phones
 *  are normalized to +91XXXXXXXXXX. */
function normalizeIdentifier(raw: string): { key: string; email: string | null; phone: string | null } {
  const s = String(raw || '').trim();
  if (isEmail(s)) {
    const email = s.toLowerCase();
    return { key: email, email, phone: null };
  }
  const phone = normalizePhone(s);
  return { key: phone, email: null, phone: phone || null };
}

/** Hide most of an email for a "sent to j••••@gmail.com" hint. */
function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const head = name.slice(0, Math.min(2, name.length));
  return `${head}${'•'.repeat(Math.max(1, name.length - head.length))}@${domain}`;
}

async function firmNameFor(tenantId: string): Promise<string> {
  try {
    const rows = await sql`SELECT name FROM tenants WHERE id = ${tenantId} OR slug = ${tenantId} LIMIT 1`;
    return rows[0]?.name || 'your workspace';
  } catch { return 'your workspace'; }
}

/**
 * Issue an OTP for a phone within a tenant. Returns the code only when DEMO_OTP
 * is on. Silent on unknown numbers (no user enumeration) — the response looks
 * identical whether or not the number belongs to a user.
 */
export async function issueOtp(tenantId: string, identifierRaw: string): Promise<{ sent: boolean; demoCode?: string; delivery: 'email' | 'demo' | 'sms' | 'none'; sentTo?: string }> {
  const { key, email, phone } = normalizeIdentifier(identifierRaw);
  if (!key) return { sent: false, delivery: DEMO_OTP ? 'demo' : 'none' };

  // Find the recipient's email. If they logged in with an email, that's it; if
  // with a phone, use the email on their user record (may be absent).
  let recipientEmail: string | null = email;
  if (!recipientEmail && phone) {
    const rows = await sql`SELECT email FROM users WHERE tenant_id = ${tenantId} AND phone = ${phone} AND status = 'ACTIVE' LIMIT 1`;
    recipientEmail = rows[0]?.email || null;
  }

  // Anti-enumeration: in production (no demo, no email channel) don't reveal
  // whether an identifier exists — claim sent without issuing anything.
  if (!DEMO_OTP && !(emailConfigured() && recipientEmail)) {
    return { sent: true, delivery: 'none' };
  }

  const code = String(Math.floor(1000 + Math.random() * 9000));
  const id = `otp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  // The auth_otp `phone` column doubles as the challenge key (email or phone).
  await sql`
    INSERT INTO auth_otp (id, tenant_id, phone, code, expires_at)
    VALUES (${id}, ${tenantId}, ${key}, ${code}, ${expiresAt});
  `;

  // Deliver by email when we can; otherwise fall back to the on-screen demo code.
  let delivered: 'email' | null = null;
  let sentTo: string | undefined;
  if (emailConfigured() && recipientEmail) {
    try {
      await sendOtpEmail(recipientEmail, code, await firmNameFor(tenantId));
      delivered = 'email';
      sentTo = maskEmail(recipientEmail);
    } catch (e: any) {
      console.warn('[Auth] OTP email send failed:', e?.message);
    }
  }

  const delivery: 'email' | 'demo' | 'none' = delivered || (DEMO_OTP ? 'demo' : 'none');
  console.log(`[Auth] OTP issued for ${key} @ ${tenantId} via ${delivery}${DEMO_OTP ? ` = ${code}` : ''}`);
  return {
    sent: delivery !== 'none',
    demoCode: DEMO_OTP ? code : undefined,
    delivery,
    sentTo,
  };
}

/** Verify an OTP and, on success, return a tenant-user token. */
export async function verifyOtp(tenantId: string, identifierRaw: string, code: string, ctx: RequestCtx = {}): Promise<{ token: string; user: any } | null> {
  const { key, email, phone } = normalizeIdentifier(identifierRaw);
  if (!key || !code) return null;

  const rows = await sql`
    SELECT * FROM auth_otp
    WHERE tenant_id = ${tenantId} AND phone = ${key} AND code = ${code}
      AND consumed = FALSE AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1
  `;
  if (rows.length === 0) {
    audit({
      tenant_id: tenantId, actor_type: 'user', actor_id: null, actor_label: key,
      action: 'auth.login_failed', target_type: 'user', target_id: null,
      summary: `OTP verify failed for ${key}`, metadata: { identifier: key }, ip: ctx.ip, user_agent: ctx.userAgent,
    });
    return null;
  }

  await sql`UPDATE auth_otp SET consumed = TRUE WHERE id = ${rows[0].id}`;

  // Match the user by whichever identifier they used.
  const users = email
    ? await sql`SELECT * FROM users WHERE tenant_id = ${tenantId} AND lower(email) = ${email} AND status = 'ACTIVE' LIMIT 1`
    : await sql`SELECT * FROM users WHERE tenant_id = ${tenantId} AND phone = ${phone} AND status = 'ACTIVE' LIMIT 1`;
  let u = users[0];
  if (!u && DEMO_OTP) {
    // Demo: an unknown number logs into the workspace owner's desk so testing
    // never dead-ends on "that number isn't a user".
    const owner = await sql`
      SELECT * FROM users WHERE tenant_id = ${tenantId} AND status = 'ACTIVE'
      ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END LIMIT 1
    `;
    u = owner[0];
  }
  if (!u) {
    audit({
      tenant_id: tenantId, actor_type: 'user', actor_id: null, actor_label: phone,
      action: 'auth.login_failed', target_type: 'user', target_id: null,
      summary: `OTP valid but no active user for ${phone}`, metadata: { phone }, ip: ctx.ip, user_agent: ctx.userAgent,
    });
    return null;
  }

  const token = signToken({ kind: 'user', tenant_id: tenantId, user_id: u.id, role: u.role });
  audit({
    tenant_id: tenantId, actor_type: 'user', actor_id: u.id, actor_label: u.name || phone,
    action: 'auth.login', target_type: 'user', target_id: u.id,
    summary: `${u.name || phone} logged in`, metadata: { phone }, ip: ctx.ip, user_agent: ctx.userAgent,
  });
  return { token, user: publicUser(u) };
}

// ---------------------------------------------------------------------------
// Superadmin (email + password)
// ---------------------------------------------------------------------------

export async function superadminLogin(email: string, password: string, ctx: RequestCtx = {}): Promise<{ token: string; superadmin: any } | null> {
  const normEmail = String(email || '').toLowerCase();
  const rows = await sql`SELECT * FROM superadmins WHERE email = ${normEmail} LIMIT 1`;
  const fail = (reason: string) => audit({
    tenant_id: null, actor_type: 'superadmin', actor_id: null, actor_label: normEmail,
    action: 'auth.login_failed', target_type: 'superadmin', target_id: null,
    summary: `Superadmin login failed for ${normEmail}: ${reason}`, metadata: { email: normEmail, reason },
    ip: ctx.ip, user_agent: ctx.userAgent,
  });

  if (rows.length === 0) { fail('unknown email'); return null; }
  const sa = rows[0];
  const ok = await bcrypt.compare(String(password || ''), sa.password_hash);
  if (!ok) { fail('bad password'); return null; }

  const token = signToken({ kind: 'superadmin', superadmin_id: sa.id, email: sa.email });
  audit({
    tenant_id: null, actor_type: 'superadmin', actor_id: sa.id, actor_label: sa.name || sa.email,
    action: 'auth.login', target_type: 'superadmin', target_id: sa.id,
    summary: `${sa.name || sa.email} (superadmin) logged in`, metadata: { email: sa.email },
    ip: ctx.ip, user_agent: ctx.userAgent,
  });
  return { token, superadmin: { id: sa.id, email: sa.email, name: sa.name } };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function publicUser(u: any): any {
  return {
    id: u.id,
    tenant_id: u.tenant_id,
    name: u.name,
    phone: u.phone,
    role: u.role,
    initials: u.metadata?.initials,
    avatar: u.metadata?.avatar,
  };
}

export async function getUserById(tenantId: string, userId: string): Promise<any | null> {
  const rows = await sql`SELECT * FROM users WHERE id = ${userId} AND tenant_id = ${tenantId} LIMIT 1`;
  return rows.length ? rows[0] : null;
}

export { DEFAULT_TENANT_ID };

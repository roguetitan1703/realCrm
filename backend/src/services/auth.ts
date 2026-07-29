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
import { randomBytes, createHash } from 'crypto';
import { sql, DEFAULT_TENANT_ID } from './db.js';
import { audit } from './audit.js';
import { emailConfigured, sendOtpEmail, sendPasswordResetEmail } from './email.js';

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
  jti?: string;   // session id (auth v2) — the sessions row that backs this token
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

async function brandFor(tenantId: string): Promise<{ name: string; color: string }> {
  try {
    const rows = await sql`SELECT name, brand_config FROM tenants WHERE id = ${tenantId} OR slug = ${tenantId} LIMIT 1`;
    const r = rows[0];
    return { name: r?.name || 'your workspace', color: r?.brand_config?.primaryColor || '#1E6F52' };
  } catch { return { name: 'your workspace', color: '#1E6F52' }; }
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
      const brand = await brandFor(tenantId);
      await sendOtpEmail(recipientEmail, code, brand.name, brand.color);
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
    email: u.email,
    login_id: u.login_id,
    role: u.role,
    status: u.status,
    must_change_password: !!u.must_change_password,
    initials: u.metadata?.initials,
    avatar: u.metadata?.avatar,
  };
}

export async function getUserById(tenantId: string, userId: string): Promise<any | null> {
  const rows = await sql`SELECT * FROM users WHERE id = ${userId} AND tenant_id = ${tenantId} LIMIT 1`;
  return rows.length ? rows[0] : null;
}

// ---------------------------------------------------------------------------
// AUTH V2 — password login, sessions, resets (spec: docs/specs/auth.md)
// One secret per user: a password. Owner/manager log in by email, agents by an
// assigned login_id. Sessions are server-tracked (30d sliding) so they can be
// listed + revoked. OTP above is kept dormant for one release, then removed.
// ---------------------------------------------------------------------------

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS) || 30;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const BCRYPT_COST = 10;
const APP_BASE_URL = (process.env.APP_BASE_URL || 'https://realestate.delpat.in').replace(/\/+$/, '');

function isActive(status: any): boolean {
  return String(status || '').toLowerCase() === 'active';
}
function sessionExpiryISO(): string {
  return new Date(Date.now() + SESSION_TTL_DAYS * 86400000).toISOString();
}

/** Minimum strength for a user-chosen password. Returns a message or null. */
export function passwordIssue(pw: string): string | null {
  if (!pw || String(pw).length < 8) return 'Password must be at least 8 characters.';
  return null;
}

/** A memorable suggestion an admin can hand over (word-place-number). */
const PW_WORDS = ['tiger', 'river', 'maple', 'cedar', 'delta', 'orbit', 'ember', 'coral', 'ivory', 'onyx', 'pine', 'wren'];
const PW_PLACES = ['pune', 'mumbai', 'thane', 'nashik', 'baner', 'wakad', 'kothrud', 'hadapsar'];
export function suggestPassword(): string {
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  return `${pick(PW_WORDS)}-${pick(PW_PLACES)}-${Math.floor(10 + Math.random() * 89)}`;
}

// ---- Sessions --------------------------------------------------------------

export async function createSession(tenantId: string | null, userId: string, ctx: RequestCtx = {}): Promise<string> {
  const id = `sess_${Date.now()}_${randomBytes(9).toString('base64url')}`;
  await sql`
    INSERT INTO sessions (id, tenant_id, user_id, expires_at, ip, user_agent)
    VALUES (${id}, ${tenantId}, ${userId}, ${sessionExpiryISO()}, ${ctx.ip || null}, ${ctx.userAgent || null})
  `;
  return id;
}

/** Load a live session and slide its window. Returns the row or null if it's
 *  missing / revoked / expired. The last_seen bump is throttled to ~5 min. */
export async function touchSession(jti: string): Promise<any | null> {
  const rows = await sql`SELECT * FROM sessions WHERE id = ${jti} AND revoked = FALSE AND expires_at > NOW() LIMIT 1`;
  if (!rows.length) return null;
  await sql`
    UPDATE sessions SET last_seen_at = NOW(), expires_at = ${sessionExpiryISO()}
    WHERE id = ${jti} AND last_seen_at < NOW() - INTERVAL '5 minutes'
  `;
  return rows[0];
}

export async function revokeSession(jti: string): Promise<void> {
  await sql`UPDATE sessions SET revoked = TRUE WHERE id = ${jti}`;
}
export async function revokeUserSessions(userId: string, exceptJti?: string): Promise<void> {
  if (exceptJti) await sql`UPDATE sessions SET revoked = TRUE WHERE user_id = ${userId} AND id <> ${exceptJti}`;
  else await sql`UPDATE sessions SET revoked = TRUE WHERE user_id = ${userId}`;
}
export async function listSessions(userId: string): Promise<any[]> {
  return sql`
    SELECT id, created_at, last_seen_at, expires_at, ip, user_agent
    FROM sessions WHERE user_id = ${userId} AND revoked = FALSE AND expires_at > NOW()
    ORDER BY last_seen_at DESC
  `;
}

// ---- Password login + lifecycle -------------------------------------------

/** Log in with a handle (email → owner/manager, login_id → agent) + password.
 *  Returns a token + session, or { error } (generic, anti-enumeration). */
export async function passwordLogin(
  tenantId: string, handleRaw: string, password: string, ctx: RequestCtx = {},
): Promise<{ token: string; user: any; mustChange: boolean } | { error: string }> {
  const handle = String(handleRaw || '').trim();
  if (!handle || !password) return { error: 'invalid' };

  const rows = isEmail(handle)
    ? await sql`SELECT * FROM users WHERE tenant_id = ${tenantId} AND lower(email) = ${handle.toLowerCase()} AND deleted_at IS NULL LIMIT 1`
    : await sql`SELECT * FROM users WHERE tenant_id = ${tenantId} AND login_id = ${handle} AND deleted_at IS NULL LIMIT 1`;
  const u = rows[0];

  const fail = () => {
    audit({
      tenant_id: tenantId, actor_type: 'user', actor_id: null, actor_label: handle,
      action: 'auth.login_failed', target_type: 'user', target_id: u?.id ?? null,
      summary: `Password login failed for ${handle}`, metadata: { handle }, ip: ctx.ip, user_agent: ctx.userAgent,
    });
    return { error: 'invalid' as const };
  };

  if (!u) return fail();
  if (u.locked_until && new Date(u.locked_until) > new Date()) return { error: 'invalid' };
  if (!isActive(u.status) || !u.password_hash) return fail();

  const ok = await bcrypt.compare(String(password), u.password_hash);
  if (!ok) {
    const failed = (u.failed_logins || 0) + 1;
    const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
    await sql`UPDATE users SET failed_logins = ${failed}, locked_until = ${lock} WHERE id = ${u.id}`;
    return fail();
  }

  await sql`UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ${u.id}`;
  const jti = await createSession(tenantId, u.id, ctx);
  const token = signToken({ kind: 'user', tenant_id: tenantId, user_id: u.id, role: u.role, jti });
  audit({
    tenant_id: tenantId, actor_type: 'user', actor_id: u.id, actor_label: u.name || handle,
    action: 'auth.login', target_type: 'user', target_id: u.id,
    summary: `${u.name || handle} logged in`, metadata: { handle }, ip: ctx.ip, user_agent: ctx.userAgent,
  });
  return { token, user: publicUser(u), mustChange: !!u.must_change_password };
}

/** Change own password (requires the current one). Revokes other sessions. */
export async function changePassword(
  tenantId: string, userId: string, current: string, next: string, currentJti?: string,
): Promise<{ ok: true } | { error: string }> {
  const issue = passwordIssue(next);
  if (issue) return { error: issue };
  const rows = await sql`SELECT * FROM users WHERE id = ${userId} AND tenant_id = ${tenantId} AND deleted_at IS NULL LIMIT 1`;
  const u = rows[0];
  if (!u || !u.password_hash) return { error: 'invalid' };
  if (!(await bcrypt.compare(String(current), u.password_hash))) return { error: 'Current password is incorrect.' };
  const hash = await bcrypt.hash(String(next), BCRYPT_COST);
  await sql`UPDATE users SET password_hash = ${hash}, must_change_password = FALSE WHERE id = ${userId}`;
  await revokeUserSessions(userId, currentJti);
  audit({
    tenant_id: tenantId, actor_type: 'user', actor_id: userId, actor_label: u.name || userId,
    action: 'auth.password_changed', target_type: 'user', target_id: userId,
    summary: `${u.name || userId} changed their password`, metadata: {},
  });
  return { ok: true };
}

/** Start a self-serve reset. Silent (no enumeration); only for verified emails. */
export async function requestPasswordReset(tenantId: string, emailRaw: string): Promise<void> {
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!isEmail(email) || !emailConfigured()) return;
  const rows = await sql`
    SELECT * FROM users
    WHERE tenant_id = ${tenantId} AND lower(email) = ${email}
      AND email_verified = TRUE AND deleted_at IS NULL AND status ILIKE 'active' LIMIT 1
  `;
  const u = rows[0];
  if (!u) return; // silent — don't reveal whether the email exists

  const token = randomBytes(24).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const id = `pwr_${Date.now()}_${randomBytes(4).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
  await sql`
    INSERT INTO password_resets (id, tenant_id, user_id, token_hash, expires_at)
    VALUES (${id}, ${tenantId}, ${u.id}, ${tokenHash}, ${expiresAt})
  `;
  const brand = await brandFor(tenantId);
  const link = `${APP_BASE_URL}/${tenantId}/reset?token=${token}`;
  try { await sendPasswordResetEmail(u.email, link, brand.name, brand.color); }
  catch (e: any) { console.warn('[Auth] reset email failed:', e?.message); }
}

/** Complete a reset with the emailed token. Revokes all the user's sessions. */
export async function resetPassword(tenantId: string, token: string, next: string): Promise<{ ok: true } | { error: string }> {
  const issue = passwordIssue(next);
  if (issue) return { error: issue };
  const tokenHash = createHash('sha256').update(String(token || '')).digest('hex');
  const rows = await sql`
    SELECT * FROM password_resets
    WHERE tenant_id = ${tenantId} AND token_hash = ${tokenHash} AND consumed = FALSE AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1
  `;
  const r = rows[0];
  if (!r) return { error: 'This reset link is invalid or has expired.' };
  const hash = await bcrypt.hash(String(next), BCRYPT_COST);
  await sql`UPDATE users SET password_hash = ${hash}, must_change_password = FALSE, failed_logins = 0, locked_until = NULL WHERE id = ${r.user_id}`;
  await sql`UPDATE password_resets SET consumed = TRUE WHERE id = ${r.id}`;
  await revokeUserSessions(r.user_id);
  audit({
    tenant_id: tenantId, actor_type: 'user', actor_id: r.user_id, actor_label: r.user_id,
    action: 'auth.password_reset', target_type: 'user', target_id: r.user_id,
    summary: `Password reset via email link`, metadata: {},
  });
  return { ok: true };
}

/** Admin sets/resets a user's password (agents have no email self-reset).
 *  Forces a change on next login and kicks their sessions. */
export async function adminSetPassword(tenantId: string, userId: string, newPassword: string, mustChange = true): Promise<boolean> {
  const hash = await bcrypt.hash(String(newPassword), BCRYPT_COST);
  const res = await sql`
    UPDATE users SET password_hash = ${hash}, must_change_password = ${mustChange}, failed_logins = 0, locked_until = NULL
    WHERE id = ${userId} AND tenant_id = ${tenantId} AND deleted_at IS NULL RETURNING id
  `;
  if (res.length) await revokeUserSessions(userId);
  return res.length > 0;
}

export { DEFAULT_TENANT_ID };

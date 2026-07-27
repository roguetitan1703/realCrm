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

/**
 * Issue an OTP for a phone within a tenant. Returns the code only when DEMO_OTP
 * is on. Silent on unknown numbers (no user enumeration) — the response looks
 * identical whether or not the number belongs to a user.
 */
export async function issueOtp(tenantId: string, phoneRaw: string): Promise<{ sent: boolean; demoCode?: string }> {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { sent: false };

  const rows = await sql`SELECT id FROM users WHERE tenant_id = ${tenantId} AND phone = ${phone} AND status = 'ACTIVE' LIMIT 1`;
  if (rows.length === 0) {
    // Don't reveal whether the number exists; pretend to send.
    return { sent: true };
  }

  const code = String(Math.floor(1000 + Math.random() * 9000));
  const id = `otp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  await sql`
    INSERT INTO auth_otp (id, tenant_id, phone, code, expires_at)
    VALUES (${id}, ${tenantId}, ${phone}, ${code}, ${expiresAt});
  `;
  // TODO(phase 4): dispatch via SMS provider. For now the code is issued and,
  // in demo mode, returned so the flow is walkable end to end.
  console.log(`[Auth] OTP issued for ${phone} @ ${tenantId}${DEMO_OTP ? ` = ${code}` : ''}`);
  return { sent: true, demoCode: DEMO_OTP ? code : undefined };
}

/** Verify an OTP and, on success, return a tenant-user token. */
export async function verifyOtp(tenantId: string, phoneRaw: string, code: string): Promise<{ token: string; user: any } | null> {
  const phone = normalizePhone(phoneRaw);
  if (!phone || !code) return null;

  const rows = await sql`
    SELECT * FROM auth_otp
    WHERE tenant_id = ${tenantId} AND phone = ${phone} AND code = ${code}
      AND consumed = FALSE AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1
  `;
  if (rows.length === 0) return null;

  await sql`UPDATE auth_otp SET consumed = TRUE WHERE id = ${rows[0].id}`;

  const users = await sql`SELECT * FROM users WHERE tenant_id = ${tenantId} AND phone = ${phone} AND status = 'ACTIVE' LIMIT 1`;
  if (users.length === 0) return null;
  const u = users[0];

  const token = signToken({ kind: 'user', tenant_id: tenantId, user_id: u.id, role: u.role });
  return { token, user: publicUser(u) };
}

// ---------------------------------------------------------------------------
// Superadmin (email + password)
// ---------------------------------------------------------------------------

export async function superadminLogin(email: string, password: string): Promise<{ token: string; superadmin: any } | null> {
  const rows = await sql`SELECT * FROM superadmins WHERE email = ${String(email || '').toLowerCase()} LIMIT 1`;
  if (rows.length === 0) return null;
  const sa = rows[0];
  const ok = await bcrypt.compare(String(password || ''), sa.password_hash);
  if (!ok) return null;
  const token = signToken({ kind: 'superadmin', superadmin_id: sa.id, email: sa.email });
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

/**
 * ============================================================================
 * 🔔 NOTIFICATIONS — per-user, per-tenant alert feed
 * ============================================================================
 * The second of the three ledgers (activities / notifications / audit_log):
 * addressed alerts a specific user should see — "a lead was assigned to you",
 * "a follow-up is due". Distinct from the audit_log (security, append-only) and
 * the business timeline (crm_timeline_events). Tenant comes from the request
 * context, so every read/write is automatically scoped.
 * ============================================================================
 */

import { sql, DEFAULT_TENANT_ID } from './db.js';
import { getContext } from './context.js';
import { sendPushToUser } from './push.js';

function tid(): string {
  return getContext()?.tenantId || DEFAULT_TENANT_ID;
}

export interface NotifyInput {
  userId: string;
  type: string;                 // lead_assigned | lead_new | followup_set | ...
  title: string;
  body?: string | null;
  link?: string | null;
  tenantId?: string;            // defaults to the request tenant
}

/** Insert one notification. Best-effort — callers fire-and-forget so a failed
 *  alert never breaks the mutation that triggered it. */
export async function notify(n: NotifyInput): Promise<void> {
  const t = n.tenantId || tid();
  if (!n.userId) return;
  const id = `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await sql`
    INSERT INTO notifications (id, tenant_id, user_id, type, title, body, link)
    VALUES (${id}, ${t}, ${n.userId}, ${n.type}, ${n.title}, ${n.body ?? null}, ${n.link ?? null});
  `;
  // Fan the same alert out to the user's devices (best-effort; push being off or
  // a device being unsubscribed never breaks the in-app feed).
  sendPushToUser(t, n.userId, {
    title: n.title,
    body: n.body || '',
    url: n.link || '/',
    icon: `/pwa/${t}/icon-192.png`,
  }).catch(() => {});
}

/** Fan out one alert to every ACTIVE user in the tenant holding one of the
 *  given roles (e.g. owners + managers for team-wide visibility). */
export async function notifyRoles(roles: string[], n: Omit<NotifyInput, 'userId'>): Promise<void> {
  const t = n.tenantId || tid();
  const users = await sql`SELECT id FROM users WHERE tenant_id = ${t} AND role IN ${sql(roles)} AND status = 'ACTIVE'`;
  for (const u of users) await notify({ ...n, userId: u.id, tenantId: t });
}

export async function listNotifications(userId: string, limit = 30): Promise<any[]> {
  return await sql`
    SELECT id, type, title, body, link, read, created_at
    FROM notifications
    WHERE tenant_id = ${tid()} AND user_id = ${userId}
    ORDER BY created_at DESC LIMIT ${limit}
  `;
}

export async function unreadCount(userId: string): Promise<number> {
  const r = await sql`SELECT count(*)::int AS n FROM notifications WHERE tenant_id = ${tid()} AND user_id = ${userId} AND read = FALSE`;
  return r[0]?.n || 0;
}

export async function markRead(id: string, userId: string): Promise<void> {
  await sql`UPDATE notifications SET read = TRUE WHERE id = ${id} AND user_id = ${userId} AND tenant_id = ${tid()}`;
}

export async function markAllRead(userId: string): Promise<void> {
  await sql`UPDATE notifications SET read = TRUE WHERE user_id = ${userId} AND tenant_id = ${tid()} AND read = FALSE`;
}

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
  /**
   * Buzz the person's devices, or just file it in the in-app feed?
   *
   * Default FALSE, deliberately. A push interrupts someone who is driving, in a
   * viewing, or asleep, and a product that interrupts for things that can wait
   * gets its notifications switched off entirely — after which the two alerts
   * that genuinely matter never arrive either. So push is reserved for "someone
   * has to act on this now" and everything else lands silently in the feed.
   */
  push?: boolean;
  /**
   * Send even when the recipient is the person who caused it. Off by default:
   * telling someone what they just did themselves is the fastest way to train
   * them to ignore the bell.
   */
  toSelf?: boolean;
}

/** Insert one notification. Best-effort — callers fire-and-forget so a failed
 *  alert never breaks the mutation that triggered it. */
export async function notify(n: NotifyInput): Promise<void> {
  const t = n.tenantId || tid();
  if (!n.userId) return;
  if (!n.toSelf && getContext()?.userId && getContext()!.userId === n.userId) return;
  const id = `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await sql`
    INSERT INTO notifications (id, tenant_id, user_id, type, title, body, link)
    VALUES (${id}, ${t}, ${n.userId}, ${n.type}, ${n.title}, ${n.body ?? null}, ${n.link ?? null});
  `;
  // Fan the same alert out to the user's devices (best-effort; push being off or
  // a device being unsubscribed never breaks the in-app feed).
  if (!n.push) return;
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

/**
 * Periodically processes scheduled notifications (followup_due, site_visit_reminder, lead_stale_sla)
 * across all active tenants using the exact same notify() and notifyRoles() primitives.
 */
export async function processScheduledNotifications(): Promise<void> {
  try {
    const tenants = await sql`SELECT DISTINCT tenant_id FROM users WHERE status ILIKE 'active'`;
    for (const { tenant_id: t } of tenants) {
      // 1. followup_due & site_visit_reminder
      const dueLeads = await sql`
        SELECT id, name, agent_id, locality, follow_up
        FROM crm_leads
        WHERE tenant_id = ${t}
          AND follow_up IS NOT NULL
          AND (follow_up->>'due_at') IS NOT NULL
          AND (follow_up->>'due_at')::timestamptz <= NOW()
          AND (follow_up->>'due_notified') IS NULL
        LIMIT 50
      `;

      for (const l of dueLeads) {
        if (l.agent_id) {
          const action = l.follow_up?.action || l.follow_up?.label || 'Follow-up';
          const isVisit = /visit/i.test(action);
          notify({
            userId: l.agent_id,
            tenantId: t,
            type: isVisit ? 'site_visit_reminder' : 'followup_due',
            title: isVisit ? '🚗 Site Visit Due Now' : '⏰ Follow-up Due Now',
            body: `${l.name}${l.locality ? ` · ${l.locality}` : ''} (${action})`,
            link: `?screen=leads&lead=${l.id}`,
            push: true,
            toSelf: true
          }).catch(() => {});
        }
        await sql`
          UPDATE crm_leads
          SET follow_up = jsonb_set(follow_up, '{due_notified}', 'true')
          WHERE id = ${l.id} AND tenant_id = ${t}
        `;
      }

      // 2. lead_stale_sla (2-hour agent warning & 4-hour manager escalation)
      const staleLeads = await sql`
        SELECT id, name, agent_id, locality, created_at,
          COALESCE((metadata->>'sla_agent_notified')::boolean, false) AS agent_notified,
          COALESCE((metadata->>'sla_mgr_notified')::boolean, false) AS mgr_notified
        FROM crm_leads
        WHERE tenant_id = ${t}
          AND stage ILIKE 'New Inquiry'
          AND created_at <= NOW() - INTERVAL '2 hours'
          AND (metadata->>'sla_mgr_notified') IS NULL
        LIMIT 30
      `;

      for (const l of staleLeads) {
        const hoursAge = (Date.now() - new Date(l.created_at).getTime()) / (1000 * 3600);
        const link = `?screen=leads&lead=${l.id}`;

        if (hoursAge >= 2 && !l.agent_notified && l.agent_id) {
          notify({
            userId: l.agent_id,
            tenantId: t,
            type: 'lead_stale_sla',
            title: '⚠️ SLA Warning: Untouched Lead',
            body: `${l.name} has been in New Inquiry for over 2 hours`,
            link,
            push: true,
            toSelf: true
          }).catch(() => {});

          await sql`
            UPDATE crm_leads
            SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{sla_agent_notified}', 'true')
            WHERE id = ${l.id} AND tenant_id = ${t}
          `;
        }

        if (hoursAge >= 4 && !l.mgr_notified) {
          notifyRoles(['owner', 'manager'], {
            tenantId: t,
            type: 'lead_stale_sla',
            title: '🚨 SLA Escalation: Untouched Lead',
            body: `${l.name} untouched in New Inquiry for >4 hours — action required`,
            link,
            push: true,
            toSelf: true
          }).catch(() => {});

          await sql`
            UPDATE crm_leads
            SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{sla_mgr_notified}', 'true')
            WHERE id = ${l.id} AND tenant_id = ${t}
          `;
        }
      }
    }
  } catch (err: any) {
    console.warn('[ScheduledNotify] Scanner iteration failed:', err?.message);
  }
}

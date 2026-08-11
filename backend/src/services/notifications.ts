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
// The retry window is shared with the dashboard tile and the Leads filter that
// count the same leads. Three definitions of "not retried" would drift.
import { RETRY_DAYS } from './store.js';
// Every word a notification says, keyed on its type.
import { copyFor } from './notificationCopy.js';

function tid(): string {
  return getContext()?.tenantId || DEFAULT_TENANT_ID;
}

export interface NotifyInput {
  userId: string;
  type: string;                 // lead_assigned | lead_new | followup_set | ...
  /**
   * The facts. Words come from the catalogue in notificationCopy.ts, keyed on
   * `type` — pass `data` and let it write the sentence.
   *
   * `title`/`body` remain accepted for anything not migrated yet, and win when
   * given, so a call site can move over one at a time. New call sites use
   * `data`: writing prose here is how one type ended up with three titles.
   */
  data?: Record<string, any>;
  title?: string;
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
  // Catalogue first, explicit text second. A call site that passes neither
  // has nothing to say and is dropped rather than filed blank.
  const c = n.title ? null : copyFor(n.type, n.data);
  const title = n.title ?? c?.title;
  const body = n.body ?? c?.body ?? null;
  if (!title) return;
  const id = `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await sql`
    INSERT INTO notifications (id, tenant_id, user_id, type, title, body, link)
    VALUES (${id}, ${t}, ${n.userId}, ${n.type}, ${title}, ${body}, ${n.link ?? null});
  `;
  // Fan the same alert out to the user's devices (best-effort; push being off or
  // a device being unsubscribed never breaks the in-app feed).
  if (!n.push) return;
  sendPushToUser(t, n.userId, {
    // The RENDERED text, not the raw input — a catalogue-driven call site
    // passes no title at all, and this would have pushed `undefined`.
    title,
    body: body || '',
    // Links are stored relative (`?screen=leads&lead=…`) because in-app they
    // resolve against whatever page you are on. A push does not have a page: the
    // service worker resolves against the origin, which turned every deep link
    // into `/?screen=…` — outside the installed app's tenant scope, so tapping an
    // alert dropped you onto the bare workspace prompt instead of the lead.
    // Qualify it with the tenant so the link stands on its own.
    url: n.link ? `/${t}${n.link}` : `/${t}`,
    icon: `/pwa/${t}/icon-192.png`,
  }).catch(() => {});
}

/** Fan out one alert to every ACTIVE user in the tenant holding one of the
 *  given roles (e.g. owners + managers for team-wide visibility). */
export async function notifyRoles(roles: string[], n: Omit<NotifyInput, 'userId'>): Promise<void> {
  const t = n.tenantId || tid();
  // ILIKE, not `= 'ACTIVE'`. users.status is written in two casings by two
  // different paths — onboarding writes 'ACTIVE', the team/seat screen writes
  // 'active' — and every real workspace goes through the second one. So an
  // exact match found nobody on any live tenant, and every alert addressed to
  // "the desk" (a new lead captured, a lead that arrived with no one to take
  // it, the SLA escalation) was assembled, addressed and then delivered to an
  // empty list. Silently: fanning out to zero users is not an error.
  const users = await sql`SELECT id FROM users WHERE tenant_id = ${t} AND role IN ${sql(roles)} AND status ILIKE 'active'`;
  for (const u of users) await notify({ ...n, userId: u.id, tenantId: t });
}

// 30 was under a fifth of what a real desk had accumulated, so the drawer was a
// window onto a pile rather than the pile. 100 covers every user on the live
// tenant today; the actual fix is alerts that CLOSE when their work is done
// (see ROADMAP-2 E5), not a bigger window.
export async function listNotifications(userId: string, limit = 100): Promise<any[]> {
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
 *
 * lead_stale_sla is LIVE (see the block below for what it now reads).
 *
 * followup_due is still inert and is left that way on purpose: it reads
 * `follow_up->>'due_at'`, and nothing in the codebase writes that key — the
 * follow-up model stores {date, time, action}, where `date` is a display string
 * like 'Today'. Making it fire means deciding how to turn that into a real
 * timestamp, which is a change to the follow-up model rather than to this
 * query, and the desk already surfaces the same fact through `overdue` on
 * Today and the dashboard.
 */
// It ran a multi-query scan across every tenant on EVERY /pulse — which every
// open tab polls every few seconds — to find nothing. Whatever it eventually
// does, it does not need doing hundreds of times a minute.
const SCAN_INTERVAL_MS = 60_000;
let lastScanAt = 0;

/**
 * Run the sweep. With no argument it does what the scheduler needs — every
 * active tenant. With `onlySlug` it does exactly one.
 *
 * That argument exists because of a specific incident: this was called from a
 * script to exercise ONE new alert against the testing org, and because the
 * only thing it could do was walk every tenant, it delivered 13 notifications
 * to the paying client's agents and stamped 13 of their leads. The alert was
 * correct and the leads were real, which is precisely why nothing stopped it.
 *
 * A test that cannot name its target is not a test, it is a production run with
 * an audience. `throttle: false` is here for the same reason — a scripted run
 * must not silently no-op because a scheduled sweep happened forty seconds ago
 * and leave someone believing the alert does not fire.
 */
export async function processScheduledNotifications(
  { onlySlug, throttle = true }: { onlySlug?: string; throttle?: boolean } = {}
): Promise<void> {
  const now = Date.now();
  if (throttle) {
    if (now - lastScanAt < SCAN_INTERVAL_MS) return;
    lastScanAt = now;
  }
  try {
    const tenants = onlySlug
      ? await sql`SELECT id AS tenant_id FROM tenants WHERE slug = ${onlySlug}`
      : await sql`SELECT DISTINCT tenant_id FROM users WHERE status ILIKE 'active'`;
    if (onlySlug && !tenants.length) throw new Error(`No tenant with slug "${onlySlug}" — refusing to fall back to all tenants.`);
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
            data: { name: l.name, locality: l.locality, action, when: l.follow_up?.time },
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

      // 2. lead_stale_sla — a lead nobody has moved off the arrival stage.
      //
      // Three things were wrong and all three were silent. It matched
      // `stage ILIKE 'New Inquiry'`, a status renamed to 'New' long ago, so it
      // selected nothing. It hardcoded 2h/4h while Settings → Follow-up SLA has
      // carried a configurable "first response" window the whole time. And it
      // had no lower bound, so the day it started matching it would have walked
      // a desk's entire history alerting on leads nobody considers urgent.
      const cfg = (await sql`
        SELECT value FROM crm_settings WHERE key = 'default' AND tenant_id = ${t}
      `)[0]?.value || {};
      // The stage a lead ARRIVES in is the firm's first configured stage — not
      // a literal, because Settings → Pipeline lets them rename it.
      const arrivalStage = (Array.isArray(cfg.stages) && cfg.stages[0]) || 'New';
      const agentHours = Math.max(Number(cfg.slaHours) || 24, 1);
      const mgrHours = agentHours * 2;
      // Only recent arrivals. Without this, turning the feature on notifies the
      // whole backlog at once — a real desk has months of leads parked on the
      // arrival stage that nobody needs paging about now. Scales with the SLA
      // rather than being another hardcoded number.
      const lookbackHours = mgrHours * 3;
      const staleLeads = await sql`
        SELECT l.id, l.name, l.agent_id, l.locality, l.created_at,
          -- The manager's version names whose lead it is; without it an
          -- escalation tells the desk something is late but not who to ask.
          u.name AS agent_name,
          COALESCE((l.metadata->>'sla_agent_notified')::boolean, false) AS agent_notified,
          COALESCE((l.metadata->>'sla_mgr_notified')::boolean, false) AS mgr_notified
        FROM crm_leads l
        LEFT JOIN users u ON u.id = l.agent_id
        WHERE l.tenant_id = ${t}
          AND l.stage = ${arrivalStage}
          AND l.created_at <= NOW() - (${agentHours}::text || ' hours')::interval
          AND l.created_at >= NOW() - (${lookbackHours}::text || ' hours')::interval
          AND (l.metadata->>'sla_mgr_notified') IS NULL
        LIMIT 30
      `;

      for (const l of staleLeads) {
        const hoursAge = (Date.now() - new Date(l.created_at).getTime()) / (1000 * 3600);
        const link = `?screen=leads&lead=${l.id}`;

        if (hoursAge >= agentHours && !l.agent_notified && l.agent_id) {
          notify({
            userId: l.agent_id,
            tenantId: t,
            // Split from the single lead_stale_sla type, which carried both
            // this and the manager escalation below — two readers, two
            // urgencies, indistinguishable except by reading the string.
            type: 'lead_untouched',
            data: { name: l.name, hours: agentHours },
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

        if (hoursAge >= mgrHours && !l.mgr_notified) {
          notifyRoles(['owner', 'manager'], {
            tenantId: t,
            type: 'lead_untouched_escalated',
            data: { name: l.name, hours: mgrHours, agent: l.agent_name },
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

      // Rung, no answer, and nobody has been back since.
      //
      // The arrival sweep above only watches leads nobody has touched at all.
      // The moment an agent logs one failed call the lead leaves that stage and
      // every alert in the system goes quiet on it — permanently. On the live
      // desk that was 26 leads, a fifth of everything in the system, 13 of them
      // untouched for three days, with nothing anywhere telling a soul.
      //
      // Goes to the assigned agent, not a manager: the useful action is a second
      // call, and the agent is who makes it. Once per lead, flagged like the
      // others, and bounded by the same lookback so switching it on does not
      // page anyone about the whole back catalogue.
      const retryLeads = await sql`
        SELECT id, name, agent_id, updated_at,
               -- Aged in SQL, by the same clock the comparison below uses.
               -- Computed as Date.now() minus this timestamp it read "3 days"
               -- for a lead staged at exactly 4: the database clock runs a few
               -- seconds ahead of the app server, so a whole-day age lands a
               -- hair under the integer and floors down.
               floor(EXTRACT(EPOCH FROM (NOW() - updated_at)) / 86400)::int AS age_days,
               -- Rendered in the desk's own zone. An agent reads "last tried
               -- 7 Aug", not a timestamp and not "4 days" twice over.
               to_char(updated_at AT TIME ZONE 'Asia/Kolkata', 'FMDD Mon') AS last_tried
        FROM crm_leads
        WHERE tenant_id = ${t}
          AND stage = 'Call Not Received'
          AND agent_id IS NOT NULL
          AND updated_at <= NOW() - (${RETRY_DAYS}::text || ' days')::interval
          AND updated_at >= NOW() - (${RETRY_DAYS * 5}::text || ' days')::interval
          AND (metadata->>'retry_notified') IS NULL
        LIMIT 30
      `;
      for (const l of retryLeads) {
        const days = l.age_days;
        notify({
          userId: l.agent_id,
          tenantId: t,
          type: 'lead_retry_due',
          data: { name: l.name, days, when: l.last_tried },
          link: `?screen=leads&lead=${l.id}`,
          push: true,
          toSelf: true
        }).catch(() => {});
        await sql`
          UPDATE crm_leads
          SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{retry_notified}', 'true')
          WHERE id = ${l.id} AND tenant_id = ${t}
        `;
      }
    }
  } catch (err: any) {
    console.warn('[ScheduledNotify] Scanner iteration failed:', err?.message);
  }
}

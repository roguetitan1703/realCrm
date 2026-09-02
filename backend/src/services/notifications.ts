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
import { pushes, undeclared } from './notificationCatalogue.js';
import { getContext } from './context.js';
import { sendPushToUser, pruneDeliveryLog } from './push.js';
// The retry window is shared with the dashboard tile and the Leads filter that
// count the same leads. Three definitions of "not retried" would drift.
// Every word a notification says, keyed on its type.
import { copyFor, COPY } from './notificationCopy.js';

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
// A TYPE NOBODY HAS DECLARED IS A TYPE NOBODY HAS DECIDED ABOUT. Twenty alert
// types grew at their call sites with no list of them anywhere; this makes the
// twenty-first impossible to add silently. It warns rather than throws -- the
// catalogue is documentation of behaviour, and refusing to boot over a missing
// row would take a desk down for a paperwork error.
{
  const missing = undeclared(Object.keys(COPY));
  if (missing.length) console.warn(`[Notify] not in notificationCatalogue.ts: ${missing.join(', ')} -- these will NOT push until declared.`);
}

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
  // WHETHER THIS REACHES A POCKET IS A PROPERTY OF THE ALERT, NOT OF THE LINE
  // THAT SENT IT. Every call site used to carry its own `push: true` -- 36 of
  // them across three files -- so the answer to "does this buzz a phone" lived
  // nowhere and could differ between two sites sending the same type. It is now
  // one column in notificationCatalogue.ts. A caller may still pass `push:
  // false` to suppress a normally-pushing alert; it can no longer promote one.
  if (n.push === false || !pushes(n.type)) return;
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
    // TRAILING SLASH, AND IT IS THE WHOLE BUG.
    //
    // The manifest sets `scope: "/<slug>/"` and the service worker registers at
    // `/<slug>/`. This built `/<slug>?screen=...` -- no slash -- which is
    // OUTSIDE that scope. With the app already open the click handler finds the
    // window and focuses it, so it works; from a cold start there is no window,
    // `clients.openWindow()` runs, the browser tries to match the URL against
    // each installed manifest's scope, matches none, and opens a plain tab.
    // Warm right, cold wrong, from one missing character.
    //
    // `routes/pwa.ts` states this exactly -- "a document at /<slug> would fall
    // outside a /<slug>/ scope" -- and the push URL was built one file away
    // without it.
    url: `/${t}/${n.link ?? ''}`,
    icon: `/pwa/${t}/icon-192.png`,
  // The delivery log ties an attempt back to the feed row it came from, so
  // "this alert" is one thing whether you are looking at the drawer or at what
  // reached a device.
  }, { notificationId: id, type: n.type }).catch(() => {});
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
 * followup_due is LIVE TOO, and this comment said the opposite for a while
 * after it stopped being true — it was made to read `at` rather than the
 * never-written `due_at`. Both it and site_visit_reminder are bounded at both
 * ends: due already, and due within the last 24 hours. A comment claiming an
 * alert is inert is worse than none, because the next person reads it instead
 * of the query and ships a deploy expecting silence.
 */
// It ran a multi-query scan across every tenant on EVERY /pulse — which every
// open tab polls every few seconds — to find nothing. Whatever it eventually
// does, it does not need doing hundreds of times a minute.
const SCAN_INTERVAL_MS = 60_000;
let lastScanAt = 0;
let lastPruneAt = 0;

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
          -- at, NOT due_at. This read a key nothing in the codebase has ever
          -- written, so the alert a desk most obviously needs -- the one saying
          -- the thing you booked is due now -- has fired zero times since it
          -- was written. at is a real instant, FOLLOWUP_PAST_DUE already reads
          -- it, and the regex guard is that one: a follow_up can hold a typed
          -- string instead of a timestamp.
          AND follow_up->>'at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          AND (follow_up->>'at')::timestamptz <= NOW()
          -- A LOWER BOUND, for the reason lead_stale_sla below already has one:
          -- the day this starts matching, it walks the desk's ENTIRE history.
          --
          -- It read due_at, a key nothing has ever written, so it has fired
          -- zero times and NO lead anywhere carries due_notified. Deploying
          -- the fix makes every past-due follow-up ever booked eligible at
          -- once, 50 per tenant per scan, every one of them a push. That is the
          -- lead_retry_due incident again: a once-per-lead gate that has never
          -- been set is not a gate, it is a backlog with a fuse.
          --
          -- 24 hours, and it is not only a deploy guard. This alert says the
          -- thing you booked is due NOW; one arriving three days late is worse
          -- than none, because the agent acts on it — the same reasoning that
          -- put a six-hour TTL on the push. Older than that is backlog, and the
          -- desk already carries it as overdue on Today and the dashboard,
          -- where nobody gets buzzed.
          AND (follow_up->>'at')::timestamptz >= NOW() - interval '24 hours'
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
      // ONE ALERT, TO ONE PERSON, ONCE.
      //
      // This was two: the assignee at slaHours, then owners + managers at twice
      // slaHours, over a lookback of six times it. NOBODY SETS EITHER MULTIPLE
      // -- `agentHours * 2` and `mgrHours * 3` were invented in this file, and
      // asked about, and no answer existed. A firm that types 24 into Settings
      // has silently also agreed to 48 and 144.
      //
      // The escalation is gone rather than exposed. A manager finding out by
      // push that one lead is late is the weakest possible version of that
      // information; the per-agent table on the dashboard says which of their
      // people has how many untouched, all day, without buzzing anyone.
      const lookbackHours = agentHours * 6;
      const staleLeads = await sql`
        SELECT l.id, l.name, l.agent_id, l.locality, l.created_at
        FROM crm_leads l
        WHERE l.tenant_id = ${t}
          AND l.stage = ${arrivalStage}
          AND l.agent_id IS NOT NULL
          AND l.created_at <= NOW() - (${agentHours}::text || ' hours')::interval
          AND l.created_at >= NOW() - (${lookbackHours}::text || ' hours')::interval
          AND (l.metadata->>'sla_agent_notified') IS NULL
        LIMIT 30
      `;

      for (const l of staleLeads) {
        notify({
          userId: l.agent_id,
          tenantId: t,
          type: 'lead_untouched',
          data: { name: l.name, hours: agentHours },
          link: `?screen=leads&lead=${l.id}`,
          toSelf: true,
        }).catch(() => {});
        await sql`
          UPDATE crm_leads
          SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{sla_agent_notified}', 'true')
          WHERE id = ${l.id} AND tenant_id = ${t}
        `;
      }

      // "No answer for N days" used to be paged from here — the alert half of
      // the No reply pile. Both are gone. The pile was 68 of Going cold's own
      // 161 plus 6 rows that were only in it because `updated_at` had moved,
      // and the desk asked for ONE clocked idea it controls, not two.
      //
      // Nothing pages a going-cold lead today. That is a gap, deliberately left
      // open rather than filled by pointing this query at a bigger predicate:
      // Going cold is 161 of bhumi's 217 open leads at the default, and turning
      // that into pushes without deciding who gets them and how often is how a
      // desk mutes the app. See docs/PARKED.md.
    }

    // Trim the delivery log at most once a day. Inside the sweep because there
    // is no other scheduler, and gated on its own clock because the sweep
    // itself runs every five minutes.
    if (Date.now() - lastPruneAt > 24 * 3600 * 1000) {
      lastPruneAt = Date.now();
      const gone = await pruneDeliveryLog().catch(() => 0);
      if (gone) console.log(`[Push] delivery log: pruned ${gone} rows older than 90 days.`);
    }
  } catch (err: any) {
    console.warn('[ScheduledNotify] Scanner iteration failed:', err?.message);
  }
}

/**
 * ============================================================================
 * AN ALERT IS OPEN WORK — when it closes (docs/specs/notifications.md §2–3)
 * ============================================================================
 * The bell never cleared: `read` was set only by the drawer, so an agent who
 * worked the lead from Today still owed its alert. Mahalaxmi's agents acted on
 * 77% of new-lead alerts within a day and carried 0 of 463 as read (prod,
 * 12 Oct); piles reached 296.
 *
 * Every alert names the records it is about (record_kind, record_ids). Its
 * TYPE names a close test in the catalogue (`closesWhen`). The tests below are
 * the only place that decides when an alert's work is done, and they ask the
 * same questions Today asks — contact is `contactedAfter()` from leadSegments,
 * "still open" is the statuses list — so the bell and Today cannot disagree.
 *
 * Reasons: `done` (somebody did the work), `not_yours` (it moved to someone
 * else, closed, or no longer exists), `opened` (an alert with no work behind
 * it, closed by being read), `superseded` (a newer alert stands for the same
 * work on the same record), `expired` (first run only: an old alert naming no
 * record, which nothing can test).
 *
 * `table` and `db` exist for one caller: the first-run measurement
 * (scripts/alert-first-run-preview.ts) copies a tenant's alerts into a TEMP
 * table inside a read-only production transaction and runs exactly these
 * statements against the copy. Same code, nothing written.
 * ============================================================================
 */

import { sql } from './db.js';
import { contactedAfter } from './leadSegments.js';
import { TERMINAL_STATUSES, OWNER_TERMINAL_STATUSES, OWNER_WALK_END } from './statuses.js';
import { closeTestFor, CLOSE_TESTS, NOTIFICATIONS, LEGACY_CLOSE, type CloseTest } from './notificationCatalogue.js';

const LEAD_OPEN = (l: string) => sql`coalesce(${sql(l)}.stage, '') NOT IN ${sql(TERMINAL_STATUSES)}`;
const OWNER_STILL_TO_CALL = (o: string) =>
  sql`coalesce(${sql(o)}.stage, 'New') NOT IN ${sql([...OWNER_TERMINAL_STATUSES, OWNER_WALK_END])}`;

/** Owner calling rows have no contact allowlist: any person-written event is the call. */
const ownerWorkedAfter = (o: string, since: any) => sql`
  EXISTS (SELECT 1 FROM crm_timeline_events e
           WHERE e.record_id = ${sql(o)}.id AND e.tenant_id = ${sql(o)}.tenant_id
             AND coalesce(e.author, 'System') NOT IN ('System', 'Import')
             AND e.timestamp >= ${since})`;

interface Rule {
  /** A record of this alert that is STILL open work. None left → the alert closes. */
  pending: any;
  /** Given that nothing is pending: was any of it actually done? Else `not_yours`. */
  done: any;
}

/**
 * The rules, against an alert row aliased `n`. Each is "is there a record this
 * alert names that still needs this person". The ANY over record_ids makes a
 * bulk alert ("12 leads assigned to you") close when the last of its twelve is
 * worked, and a single alert when its one is.
 */
function rule(test: CloseTest, tz: string): Rule | null {
  switch (test) {
    // Assigned to you / moved to you / still waiting / came back.
    case 'lead_worked': return {
      pending: sql`EXISTS (SELECT 1 FROM crm_leads l
        WHERE l.tenant_id = n.tenant_id AND l.id = ANY(n.record_ids)
          AND ${LEAD_OPEN('l')} AND l.agent_id = n.user_id
          AND NOT ${contactedAfter('l', sql`n.created_at`)})`,
      done: sql`EXISTS (SELECT 1 FROM crm_leads l
        WHERE l.tenant_id = n.tenant_id AND l.id = ANY(n.record_ids)
          AND ${contactedAfter('l', sql`n.created_at`)})`,
    };
    // The desk's copy of a lead alert (legacy "new lead captured"): no
    // recipient test, the desk does not hold leads.
    case 'lead_worked_desk': return {
      pending: sql`EXISTS (SELECT 1 FROM crm_leads l
        WHERE l.tenant_id = n.tenant_id AND l.id = ANY(n.record_ids)
          AND ${LEAD_OPEN('l')} AND NOT ${contactedAfter('l', sql`n.created_at`)})`,
      done: sql`EXISTS (SELECT 1 FROM crm_leads l
        WHERE l.tenant_id = n.tenant_id AND l.id = ANY(n.record_ids)
          AND ${contactedAfter('l', sql`n.created_at`)})`,
    };
    // Arrived with nobody to take it: done the moment somebody has it.
    case 'lead_routed': return {
      pending: sql`EXISTS (SELECT 1 FROM crm_leads l
        WHERE l.tenant_id = n.tenant_id AND l.id = ANY(n.record_ids)
          AND ${LEAD_OPEN('l')} AND l.agent_id IS NULL)`,
      done: sql`EXISTS (SELECT 1 FROM crm_leads l
        WHERE l.tenant_id = n.tenant_id AND l.id = ANY(n.record_ids) AND l.agent_id IS NOT NULL)`,
    };
    // A booked next step. Open while that SAME booking stands: an outcome
    // clears follow_up (routes/actions.ts), a reschedule changes its `at`.
    // Rows from before `subject_at` was stored compare against the alert's own
    // time: a follow-up still due at or before it is the one it was about.
    case 'booking': return {
      pending: sql`EXISTS (SELECT 1 FROM crm_leads l
        WHERE l.tenant_id = n.tenant_id AND l.id = ANY(n.record_ids)
          AND ${LEAD_OPEN('l')} AND l.agent_id = n.user_id
          AND l.follow_up IS NOT NULL
          AND CASE WHEN n.subject_at IS NOT NULL THEN l.follow_up->>'at' = n.subject_at
                   ELSE l.follow_up->>'at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                        AND (l.follow_up->>'at')::timestamptz <= n.created_at END)`,
      done: sql`EXISTS (SELECT 1 FROM crm_leads l
        WHERE l.tenant_id = n.tenant_id AND l.id = ANY(n.record_ids)
          AND ${LEAD_OPEN('l')} AND l.agent_id = n.user_id)`,
    };
    // An owner to call: called (anything a person wrote on the row), moved,
    // or the walk is over.
    case 'owner_worked': return {
      pending: sql`EXISTS (SELECT 1 FROM crm_owners o
        WHERE o.tenant_id = n.tenant_id AND o.id = ANY(n.record_ids)
          AND ${OWNER_STILL_TO_CALL('o')} AND o.agent_id = n.user_id
          AND NOT ${ownerWorkedAfter('o', sql`n.created_at`)})`,
      done: sql`EXISTS (SELECT 1 FROM crm_owners o
        WHERE o.tenant_id = n.tenant_id AND o.id = ANY(n.record_ids)
          AND ${ownerWorkedAfter('o', sql`n.created_at`)})`,
    };
    // A rent ending: open while the agreement is still active and still ends
    // within the 30 days it was raised for. Renewed or ended → done.
    case 'agreement': return {
      pending: sql`EXISTS (SELECT 1 FROM crm_agreements a
        WHERE a.tenant_id = n.tenant_id AND a.id = ANY(n.record_ids)
          AND a.status = 'active' AND a.end_date IS NOT NULL
          AND a.end_date <= (now() AT TIME ZONE ${tz})::date + 30)`,
      done: sql`EXISTS (SELECT 1 FROM crm_agreements a
        WHERE a.tenant_id = n.tenant_id AND a.id = ANY(n.record_ids))`,
    };
    // A buyer on a shared link (listing-pages.md §A). The alert names a lead or
    // a tap (an I'm interested press, or Talk to us on an expired link): a
    // lead closes like lead_worked; a tap when Add as lead or attach put it on
    // a lead.
    case 'share_work': {
      // No recipient test on the lead: the alert may have gone to the link's
      // creator or the desk because nobody active held it. Contact by anyone closes it.
      const lw = rule('lead_worked_desk', tz)!;
      const tap = (leadTest: any) => sql`(n.record_kind = 'share_tap' AND EXISTS (SELECT 1 FROM crm_share_events e
                WHERE e.tenant_id = n.tenant_id AND e.id = ANY(n.record_ids) AND ${leadTest}))`;
      return {
        pending: sql`((n.record_kind = 'lead' AND ${lw.pending}) OR ${tap(sql`e.lead_id IS NULL`)})`,
        done: sql`((n.record_kind = 'lead' AND ${lw.done}) OR ${tap(sql`e.lead_id IS NOT NULL`)})`,
      };
    }
    case 'opened': return null;
  }
}

/**
 * Close every open alert whose work is done. Tenant-wide, or for one record
 * (the write path knows which record it touched). Returns how many closed.
 *
 * Called after every successful write (index.ts, debounced per tenant) so the
 * bell is right within a second of the work, and from the sweep as the net.
 */
export async function closeSettled(
  tenantId: string,
  { recordId, table = 'notifications', db = sql }: { recordId?: string; table?: string; db?: any } = {},
): Promise<number> {
  if (!tenantId) return 0;
  const T = sql(table);
  const scope = recordId ? sql`AND ${recordId} = ANY(n.record_ids)` : sql``;
  let closed = 0;
  // The firm's own clock, for "ends within 30 days". Imported when called, not
  // at load: this module stays free of store.ts (see statuses.ts).
  const tz = await (await import('./store.js')).timezoneOf(tenantId);

  for (const test of CLOSE_TESTS) {
    const types = typesFor(test);
    if (!types.length) continue;
    const r = rule(test, tz);
    if (!r) {
      const res = await db`
        UPDATE ${T} n SET closed_at = NOW(), close_reason = 'opened'
        WHERE n.tenant_id = ${tenantId} AND n.closed_at IS NULL AND (n.read_at IS NOT NULL OR n.read = TRUE)
          AND n.type IN ${sql(types)} ${scope}`;
      closed += res.count;
      continue;
    }
    const res = await db`
      UPDATE ${T} n
         SET closed_at = NOW(),
             close_reason = CASE WHEN ${r.done} THEN 'done' ELSE 'not_yours' END
       WHERE n.tenant_id = ${tenantId} AND n.closed_at IS NULL
         AND n.type IN ${sql(types)}
         AND cardinality(n.record_ids) > 0
         AND NOT ${r.pending} ${scope}`;
    closed += res.count;
    // ONE OPEN ALERT PER PIECE OF WORK. "Assigned to you", then "still
    // waiting", then a legacy "SLA" alert about the same untouched lead were
    // three rows in the bell for one call to make. The newest stands for it;
    // the older ones close as `superseded`.
    const dup = await db`
      UPDATE ${T} n SET closed_at = NOW(), close_reason = 'superseded'
       WHERE n.tenant_id = ${tenantId} AND n.closed_at IS NULL
         AND n.type IN ${sql(types)} AND cardinality(n.record_ids) = 1
         AND EXISTS (SELECT 1 FROM ${T} m
                      WHERE m.tenant_id = n.tenant_id AND m.user_id = n.user_id AND m.closed_at IS NULL
                        AND m.type IN ${sql(types)} AND m.record_ids = n.record_ids
                        AND (m.created_at, m.id) > (n.created_at, n.id)) ${scope}`;
    closed += dup.count;
  }

  // An alert that names no record cannot be tested against work. It closes
  // when it is read, like the alerts that have no work behind them.
  const loose = await db`
    UPDATE ${T} n SET closed_at = NOW(), close_reason = 'opened'
    WHERE n.tenant_id = ${tenantId} AND n.closed_at IS NULL AND (n.read_at IS NOT NULL OR n.read = TRUE)
      AND coalesce(cardinality(n.record_ids), 0) = 0 ${scope}`;
  return closed + loose.count;
}

/** Every type, declared or historical, whose close test is `test`. */
function typesFor(test: CloseTest): string[] {
  return KNOWN_TYPES.filter(t => closeTestFor(t) === test);
}
// Declared types come from the catalogue; the historical ones still sitting in
// tables are named in notificationCatalogue.ts LEGACY_CLOSE.
const KNOWN_TYPES = [...NOTIFICATIONS.map(k => k.key), ...Object.keys(LEGACY_CLOSE)];

/**
 * What an alert is about, from the link it was always given. Used to fill
 * `record_kind`/`record_ids` on alerts written before those columns existed,
 * and as the fallback for a call site that passes a link but no record.
 */
export function recordFromLink(link: string | null | undefined): { kind: string; ids: string[] } | null {
  const q = new URLSearchParams(String(link || '').replace(/^[^?]*\?/, ''));
  for (const [param, kind] of [['lead', 'lead'], ['owner', 'owner'], ['agreement', 'agreement']] as const) {
    const v = q.get(param);
    if (v) return { kind, ids: [v] };
  }
  return null;
}

/**
 * Fill record_kind/record_ids on alerts written before they existed, from
 * their links. Bulk alerts linked to a filtered list name no record and stay
 * empty — they close when read.
 */
export async function backfillAlertRecords(table = 'notifications', tenantId?: string, db: any = sql): Promise<number> {
  const T = sql(table);
  const t = tenantId ? sql`AND tenant_id = ${tenantId}` : sql``;
  const lead = await db`
    UPDATE ${T} SET record_kind = 'lead', record_ids = ARRAY[substring(link from 'lead=([^&]+)')]
    WHERE record_ids IS NULL AND link ~ '[?&]lead=' ${t}`;
  const owner = await db`
    UPDATE ${T} SET record_kind = 'owner', record_ids = ARRAY[substring(link from 'owner=([^&]+)')]
    WHERE record_ids IS NULL AND link ~ '[?&]owner=' ${t}`;
  return lead.count + owner.count;
}

/**
 * Alerts from before records were named, that name none — "12 leads assigned
 * to you" linking a filtered list. Nothing can test them against work, and the
 * work they announced is in each person's Today already. The first run closes
 * them as `expired`: closed without knowing, and saying so. Every alert raised
 * since names its records.
 */
export async function expireRecordless(table = 'notifications', tenantId?: string, db: any = sql): Promise<number> {
  const T = sql(table);
  const t = tenantId ? sql`AND tenant_id = ${tenantId}` : sql``;
  const r = await db`
    UPDATE ${T} SET closed_at = NOW(), close_reason = 'expired'
    WHERE closed_at IS NULL AND coalesce(cardinality(record_ids), 0) = 0 ${t}`;
  return r.count;
}

/**
 * THE FIRST RUN (spec §10): name the records on every existing alert, then
 * close the ones whose work is already done. Gated by runOnce at boot; on
 * production it runs when the API carrying it is deployed.
 */
export async function firstRunAlertLifecycle(): Promise<void> {
  const filled = await backfillAlertRecords();
  const tenants = await sql`SELECT DISTINCT tenant_id FROM notifications WHERE closed_at IS NULL`;
  let closed = 0;
  for (const { tenant_id } of tenants) closed += await closeSettled(tenant_id);
  const expired = await expireRecordless();
  console.log(`[Alerts] first run: ${filled} alerts given their records, ${closed} closed as settled, ${expired} record-less closed as expired.`);
}

/** Debounced per tenant: a burst of writes closes once, a second later. */
const pending = new Map<string, NodeJS.Timeout>();
export function scheduleCloseSettled(tenantId: string | undefined): void {
  if (!tenantId) return;
  const prev = pending.get(tenantId);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    pending.delete(tenantId);
    closeSettled(tenantId).catch(err => console.warn('[Alerts] close failed:', err?.message));
  }, 1000);
  timer.unref?.();
  pending.set(tenantId, timer);
}

/**
 * EVERY TYPE EARNS ITS PUSH (spec §6). Per type, over `days`: raised, pushed,
 * shown on a screen, opened, closed as done, still open — and the question
 * that decides a type's tier: of the ones done, how many inside 2 hours when
 * the push was SHOWN against when it was not. A type whose two numbers match
 * is not changing what anyone does; it moves down a tier in the catalogue.
 *
 * Only alerts raised since the lifecycle existed: earlier rows were closed in
 * bulk by the first run, at its time, which says nothing about anyone's work.
 */
export async function alertOutcomes(tenantId: string, days = 14): Promise<any[]> {
  return await sql`
    WITH since AS (
      SELECT greatest(NOW() - (${days}::text || ' days')::interval,
                      coalesce((SELECT applied_at FROM schema_migrations
                                 WHERE name = '2026_10_12_alert_lifecycle_first_run'), NOW())) AS t
    )
    SELECT n.type,
      count(*)::int AS raised,
      count(*) FILTER (WHERE n.pushed_at IS NOT NULL)::int AS pushed,
      count(*) FILTER (WHERE n.shown_at IS NOT NULL)::int AS shown,
      count(*) FILTER (WHERE n.read_at IS NOT NULL)::int AS opened,
      count(*) FILTER (WHERE n.close_reason = 'done')::int AS done,
      count(*) FILTER (WHERE n.close_reason = 'not_yours')::int AS not_yours,
      count(*) FILTER (WHERE n.closed_at IS NULL)::int AS open,
      count(*) FILTER (WHERE n.shown_at IS NOT NULL AND n.close_reason = 'done'
                         AND n.closed_at <= n.created_at + interval '2 hours')::int AS done_2h_shown,
      count(*) FILTER (WHERE n.shown_at IS NOT NULL)::int AS base_shown,
      count(*) FILTER (WHERE n.shown_at IS NULL AND n.close_reason = 'done'
                         AND n.closed_at <= n.created_at + interval '2 hours')::int AS done_2h_unshown,
      count(*) FILTER (WHERE n.shown_at IS NULL)::int AS base_unshown,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM n.closed_at - n.created_at) / 60)
            FILTER (WHERE n.close_reason = 'done'))::int AS median_done_min
    FROM notifications n, since
    WHERE n.tenant_id = ${tenantId} AND n.created_at >= since.t
    GROUP BY n.type
    ORDER BY raised DESC`;
}

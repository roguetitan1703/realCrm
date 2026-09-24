/**
 * ============================================================================
 * WHAT SOMEBODY DID TODAY — the activity report, "My day" and "Team today"
 * ============================================================================
 * The owner asked to see each agent's work every day; the agents asked to see
 * their own. Everything below counts ACTIONS A PERSON TOOK, and nothing else.
 * The spec, and why each rule is there: docs/specs/mahalaxmi-batch.md,
 * "Agent activity — the business first" and "Activity — the calling side".
 *
 * ONE LIST OF FACTS. Every number on either screen is a count over `facts()`,
 * and the list a number opens is the same `facts()` filtered to that number —
 * same scope, same expression, one query — so a count and the people behind it
 * cannot disagree. A fact is (person, record, measure, detail, when).
 *
 * WHAT IS NOT ACTIVITY, and is excluded at the one place facts are read:
 *   • anything written by System (assignment, the rota, auto New → Contacted,
 *     the auto-advance a logged visit does) or by Import (a sheet's status);
 *   • being handed records, opening one to look at it.
 *
 * THE WORDS. A call is a tap on the Call button — the app cannot know the phone
 * rang. So "calls" is never "answered": answered comes only from the outcome
 * the caller wrote down (CALL_REACH in src/data/callOutcomes.js), and calls
 * with no outcome are counted out loud, because that number is the one that
 * gets people writing them down.
 *
 * A STATUS CHANGE is told as what the customer BECAME, per person per record
 * per day: the last status they set, and nothing if that is where the record
 * started the day — a status flipped and flipped back counts 0.
 *
 * THE DAY is the firm's, midnight to midnight in its own timezone (dayStart).
 * Things that are only true NOW — a follow-up already late, one due tomorrow —
 * are answered for today only; a past day's report does not pretend to know
 * what was late on it.
 * ============================================================================
 */
import { sql } from './db.js';
import { getContext } from './context.js';
import { timezoneOf, FOLLOWUP_OVERDUE, OPEN, OWNER_OPEN } from './store.js';
import { CONTACT_EVENT_TYPES } from './leadSegments.js';
import { CALL_OUTCOMES } from '../../../src/data/callOutcomes.js';

export type Side = 'leads' | 'calling';

/** Outcome keys by whether anybody picked up, from the one catalogue. */
const keysFor = (reach: string) => (CALL_OUTCOMES as any[]).filter(o => o.reach === reach).map(o => o.value);
const reachOf = sql`(CASE
  WHEN coalesce(e.metadata->>'outcome', '') = '' THEN 'no_outcome'
  WHEN e.metadata->>'outcome' IN ${sql(keysFor('answered'))} THEN 'answered'
  WHEN e.metadata->>'outcome' IN ${sql(keysFor('no_answer'))} THEN 'no_answer'
  WHEN e.metadata->>'outcome' IN ${sql(keysFor('unreachable'))} THEN 'unreachable'
  WHEN e.metadata->>'outcome' IN ${sql(keysFor('wrong_number'))} THEN 'wrong_number'
  ELSE 'other' END)`;

/** Written by a person. System and Import are not anybody's work. */
const BY_PERSON = sql`coalesce(e.author, 'System') NOT IN ('System', 'Import')
  AND coalesce(e.metadata->>'auto', '') <> 'true'`;

/**
 * What a status change became, and what it came from.
 *
 * Read from metadata since the writers started recording it (updateLead,
 * updateOwner). Older rows carry it only in the title, in the three wordings the
 * product has used: "New → Interested — note", "Stage Changed -> Interested",
 * and the owners' "Stage → Interested" (which never said where it came from).
 */
const STAGE_TO = sql`coalesce(nullif(e.metadata->>'to', ''),
  CASE WHEN e.title LIKE '%→%' THEN trim(split_part(regexp_replace(e.title, '^.*→', ''), ' — ', 1))
       WHEN e.title LIKE '%->%' THEN trim(split_part(regexp_replace(e.title, '^.*->', ''), ':', 1))
  END)`;
const STAGE_FROM = sql`coalesce(nullif(e.metadata->>'from', ''),
  CASE WHEN e.title LIKE '%→%' AND e.title NOT LIKE 'Stage →%' THEN trim(split_part(e.title, '→', 1)) END)`;

/** The day asked for, as the firm's [start, end). `date` is YYYY-MM-DD or null for today. */
function dayBounds(tz: string, date: string | null) {
  const day = date ? sql`${date}::date` : sql`(now() AT TIME ZONE ${tz})::date`;
  return {
    d0: sql`((${day})::timestamp AT TIME ZONE ${tz})`,
    d1: sql`(((${day}) + 1)::timestamp AT TIME ZONE ${tz})`,
    d2: sql`(((${day}) + 2)::timestamp AT TIME ZONE ${tz})`,
    isToday: sql`((${day}) = (now() AT TIME ZONE ${tz})::date)`,
  };
}

/**
 * Every fact for one side of the desk on one day. The single source of every
 * number on both screens and every list they open.
 */
function facts(side: Side, t: string, tz: string, date: string | null) {
  const { d0, d1, d2, isToday } = dayBounds(tz, date);
  const table = side === 'leads' ? sql`crm_leads` : sql`crm_owners`;
  const inDay = sql`e.timestamp >= ${d0} AND e.timestamp < ${d1}`;
  const onSide = sql`JOIN ${table} r ON r.id = e.record_id AND r.tenant_id = ${t}`;

  const events = sql`
    SELECT e.author AS person, e.record_id, e.timestamp AS at,
           CASE e.type WHEN 'call' THEN 'call' WHEN 'whatsapp' THEN 'whatsapp'
                       WHEN 'remark' THEN 'note' ELSE 'followup_set' END AS measure,
           CASE WHEN e.type = 'call' THEN ${reachOf} ELSE NULL END AS detail
      FROM crm_timeline_events e ${onSide}
     WHERE e.tenant_id = ${t} AND ${inDay} AND ${BY_PERSON}
       AND (e.type IN ('call', 'whatsapp')
            -- A rejection used to write its reason a second time as a remark
            -- ("Rejected: Budget Mismatch"); that is the status change, not a
            -- note, and it is counted once, there. See RejectLeadModal.
            OR (e.type = 'remark' AND e.description NOT LIKE 'Rejected: %')
            OR (e.type = 'follow_up' AND e.title IN ('Scheduled', 'Rescheduled', 'Callback scheduled')))
    UNION ALL
    -- Done because the work happened (closeFollowUpFor) or ticked done by the
    -- person. The calling side has no "done": a callback is cleared, and a
    -- cleared callback is not proof anybody rang.
    SELECT e.author, e.record_id, e.timestamp, 'followup_done', NULL
      FROM crm_timeline_events e ${onSide}
     WHERE e.tenant_id = ${t} AND ${inDay} AND ${BY_PERSON}
       AND e.type = 'follow_up' AND e.title = 'Completed'`;

  const statuses = sql`
    SELECT person, record_id, at, 'status' AS measure, last_to AS detail FROM (
      SELECT e.author AS person, e.record_id,
             max(e.timestamp) AS at,
             (array_agg(${STAGE_TO} ORDER BY e.timestamp DESC))[1] AS last_to,
             (array_agg(${STAGE_FROM} ORDER BY e.timestamp ASC))[1] AS first_from
        FROM crm_timeline_events e ${onSide}
       WHERE e.tenant_id = ${t} AND ${inDay} AND ${BY_PERSON} AND e.type = 'stage_change'
       GROUP BY 1, 2) s
     WHERE last_to IS NOT NULL AND last_to IS DISTINCT FROM first_from`;

  if (side === 'calling') {
    return sql`
      ${events}
      UNION ALL ${statuses}
      UNION ALL
      SELECT r.agent_id, r.id, r.callback_at, 'followup_late', NULL FROM crm_owners r
       WHERE r.tenant_id = ${t} AND r.agent_id IS NOT NULL AND ${isToday}
         AND ${OWNER_OPEN} AND r.callback_at IS NOT NULL AND r.callback_at < now()
      UNION ALL
      SELECT r.agent_id, r.id, r.callback_at, 'followup_tomorrow', NULL FROM crm_owners r
       WHERE r.tenant_id = ${t} AND r.agent_id IS NOT NULL AND ${isToday}
         AND ${OWNER_OPEN} AND r.callback_at >= ${d1} AND r.callback_at < ${d2}`;
  }

  // When a lead came in: its first arrival, or a repeat enquiry the same day.
  const arrived = sql`greatest(r.created_at, coalesce((
      SELECT max(coalesce(q.last_at, q.created_at)) FROM crm_lead_enquiries q
       WHERE q.tenant_id = r.tenant_id AND q.lead_id = r.id
         AND coalesce(q.last_at, q.created_at) < ${d1}), r.created_at))`;
  return sql`
    ${events}
    UNION ALL ${statuses}
    UNION ALL
    SELECT a.agent_id, a.lead_id, a.at, 'visit', NULL FROM activities a
      JOIN crm_leads r ON r.id = a.lead_id AND r.tenant_id = ${t}
     WHERE a.tenant_id = ${t} AND a.type = 'site_visit' AND a.agent_id IS NOT NULL
       AND a.at >= ${d0} AND a.at < ${d1}
    UNION ALL
    -- Came in on this day, and whether a person reached out after it did, before
    -- the day was out. Held by whoever holds the lead: an enquiry nobody has
    -- called is a question for its owner, not for whoever last touched it.
    SELECT agent_id, id, came, 'came_in',
           CASE WHEN EXISTS (SELECT 1 FROM crm_timeline_events e
                              WHERE e.tenant_id = ${t} AND e.record_id = x.id
                                AND ${BY_PERSON} AND e.type IN ${sql(CONTACT_EVENT_TYPES)}
                                AND e.timestamp >= x.came AND e.timestamp < ${d1})
                THEN 'called' ELSE 'not_called' END
      FROM (SELECT r.id, r.agent_id, ${arrived} AS came FROM crm_leads r
             WHERE r.tenant_id = ${t} AND r.agent_id IS NOT NULL AND r.created_at < ${d1}) x
     WHERE came >= ${d0} AND came < ${d1}
    UNION ALL
    SELECT r.agent_id, r.id, (r.follow_up->>'at')::timestamptz, 'followup_late', NULL FROM crm_leads r
     WHERE r.tenant_id = ${t} AND r.agent_id IS NOT NULL AND ${isToday} AND ${FOLLOWUP_OVERDUE}
    UNION ALL
    SELECT r.agent_id, r.id, (r.follow_up->>'at')::timestamptz, 'followup_tomorrow', NULL FROM crm_leads r
     WHERE r.tenant_id = ${t} AND r.agent_id IS NOT NULL AND ${isToday} AND ${OPEN}
       AND r.follow_up->>'at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       AND (r.follow_up->>'at')::timestamptz >= ${d1} AND (r.follow_up->>'at')::timestamptz < ${d2}`;
}

/** An agent reads their own day; the desk reads anybody's. */
function allowedPerson(person: string | null): string | null {
  const c = getContext();
  if (c?.role === 'agent') return c.userId || '__none__';
  return person;
}

const validDate = (d: any) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

/**
 * The day, for one person or for the whole desk.
 * Returns one row per person: every count by measure and detail, and the
 * number of distinct records behind each.
 */
export async function activityDay(opts: { side: Side; date?: string | null; person?: string | null }) {
  const t = getContext()!.tenantId;
  const tz = await timezoneOf(t);
  const date = validDate(opts.date);
  const person = allowedPerson(opts.person ?? null);
  const f = facts(opts.side, t, tz, date);

  // `people` is the calls again, counted by person rather than by tap: five
  // calls to one number is five calls and one person. Summing the per-outcome
  // rows would count somebody twice, so it is its own row of the same facts.
  const counts = await sql`
    WITH f AS (SELECT * FROM (${f}) x WHERE person IS NOT NULL ${person ? sql`AND person = ${person}` : sql``})
    SELECT person, measure, detail, count(*)::int AS n, count(DISTINCT record_id)::int AS records
      FROM f GROUP BY 1, 2, 3
    UNION ALL
    SELECT person, 'people', NULL, count(DISTINCT record_id)::int, count(DISTINCT record_id)::int
      FROM f WHERE measure = 'call' GROUP BY 1`;

  // Who is on the desk: every active member (so a person with nothing today
  // still has a row — that is the thing the owner is looking for), plus anybody
  // else who did something.
  const people = await sql`
    SELECT u.id, u.name, u.role, coalesce(a.duty_status, 'ACTIVE') AS duty,
           (SELECT count(*)::int FROM ${opts.side === 'leads' ? sql`crm_leads` : sql`crm_owners`} r
             WHERE r.tenant_id = ${t} AND r.agent_id = u.id) AS holding
      FROM users u LEFT JOIN crm_agents a ON a.id = u.id AND a.tenant_id = u.tenant_id
     WHERE u.tenant_id = ${t} AND u.deleted_at IS NULL AND lower(u.status) <> 'suspended'
       ${person ? sql`AND u.id = ${person}` : sql``}`;

  const [clock] = await sql`
    SELECT to_char(${date ? sql`${date}::date` : sql`(now() AT TIME ZONE ${tz})::date`}, 'YYYY-MM-DD') AS day,
           to_char((now() AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS today,
           extract(hour FROM now() AT TIME ZONE ${tz})::int AS hour`;

  const byPerson = new Map<string, any>();
  for (const p of people as any[]) {
    byPerson.set(p.id, { id: p.id, name: p.name, role: p.role, duty: p.duty, holding: p.holding, counts: [] });
  }
  // Somebody who is no longer on the desk can still be the one holding a lead
  // that came in today, and "held by usr_…" helps nobody. Named from any
  // account they ever had, marked as gone.
  const strangers = [...new Set((counts as any[]).map(c => c.person).filter(id => !byPerson.has(id)))];
  const known = strangers.length ? await sql`
    SELECT coalesce(u.id, a.id) AS id, coalesce(u.name, a.name) AS name, u.role
      FROM users u FULL JOIN crm_agents a ON a.id = u.id AND a.tenant_id = u.tenant_id
     WHERE coalesce(u.id, a.id) IN ${sql(strangers)} AND coalesce(u.tenant_id, a.tenant_id) = ${t}` : [];
  const nameOf = new Map((known as any[]).map(k => [k.id, k]));
  for (const c of counts as any[]) {
    if (!byPerson.has(c.person)) {
      const k: any = nameOf.get(c.person);
      byPerson.set(c.person, { id: c.person, name: k?.name || null, role: k?.role || null, duty: null, gone: true, holding: 0, counts: [] });
    }
    byPerson.get(c.person).counts.push({ measure: c.measure, detail: c.detail, n: c.n, records: c.records });
  }
  return { side: opts.side, day: clock.day, today: clock.today, hour: clock.hour, timezone: tz, people: [...byPerson.values()] };
}

/**
 * The people behind one number: the same facts, filtered to that number.
 * `detail` narrows a measure (a call's reach, the status a record became).
 */
export async function activityRecords(opts: { side: Side; date?: string | null; person?: string | null; measure: string; detail?: string | null }) {
  const t = getContext()!.tenantId;
  const tz = await timezoneOf(t);
  const person = allowedPerson(opts.person ?? null);
  const f = facts(opts.side, t, tz, validDate(opts.date));
  const table = opts.side === 'leads' ? sql`crm_leads` : sql`crm_owners`;
  const rows = await sql`
    SELECT f.record_id AS id, f.person, f.measure, f.detail, f.at, r.name, r.phone, r.stage,
           ${opts.side === 'calling' ? sql`r.project, r.tower, r.unit_no` : sql`NULL AS project, NULL AS tower, NULL AS unit_no`}
      FROM (${f}) f JOIN ${table} r ON r.id = f.record_id AND r.tenant_id = ${t}
     WHERE f.measure = ${opts.measure}
       ${opts.detail ? sql`AND f.detail = ${opts.detail}` : sql``}
       ${person ? sql`AND f.person = ${person}` : sql`AND f.person IS NOT NULL`}
     ORDER BY f.at DESC NULLS LAST
     LIMIT 500`;
  return rows.map((r: any) => ({
    id: r.id, person: r.person, measure: r.measure, detail: r.detail, at: r.at,
    name: r.name, phone: r.phone, stage: r.stage,
    unit: [r.project, [r.tower, r.unit_no].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || null,
  }));
}

/**
 * ============================================================================
 * 🗂️ EVERY LEAD SEGMENT, IN ONE PLACE
 * ============================================================================
 * The piles a desk works — what each one is CALLED, what it MEANS in a sentence,
 * and the SQL that decides it — side by side, so all of it can be read at once
 * and changed in one file.
 *
 * It was spread across four: the SQL in store.ts, the pill labels in
 * definitions.jsx, the tile labels in Dashboard.jsx, and the Going-cold toggle
 * picking two of the segments under a third name. Nothing kept them in step. The
 * dashboard tile said "Past SLA", the pill beside the same rows said "Never
 * called", and they were the same expression with a clock on one of them — which
 * is how a tile and the list it opens end up disagreeing in front of an agent.
 *
 * The labels here are served to the frontend (workspace bootstrap) rather than
 * repeated there. A label repeated is a label that drifts.
 *
 * KEYS ARE STABLE AND LABELS ARE NOT. A key appears in the query string —
 * `?screen=leads&seg=never_contacted` — so a filtered list somebody sent a
 * colleague last week has to keep working. Rename freely in `label`; leave `key`
 * alone.
 * ============================================================================
 */
import { sql } from './db.js';

/**
 * CONTACT IS SOMETHING A PERSON DID.
 *
 * The old rule counted call/whatsapp/sms/email and three activity types, and
 * nothing else. So a lead carrying the remark "Not rec phone, texted on whatapp"
 * was filed as never contacted, and so was one an agent had moved to Call Not
 * Received — which they can only have done after ringing it. On the live desk
 * that was 83 leads called untouched, of which 76 had been demonstrably worked.
 *
 * `author <> 'System'` IS THE WHOLE GUARD, and it is load-bearing. Lead
 * creation, the status mirror and the re-enquiry events are all written by
 * System; count those and every lead is contacted the moment it arrives, and
 * the segment stops meaning anything at all.
 *
 * STILL AN ALLOWLIST, and not "anything a person wrote", because the three
 * types nobody should ever count — `assignment` (3,659 rows), `creation` (506)
 * and `lead` (30) — are System-written today and would start counting the day
 * one of them was stamped with a name. A lead is not contacted because somebody
 * created it.
 *
 * Measured across both databases, a person has ever authored exactly seven
 * types: note, call, stage_change, whatsapp, remark, follow_up and email. All
 * seven are below; `sms` is here as a channel the product sends and nobody has
 * logged yet. `follow_up` was the one genuinely missing — booking a next step
 * is work done on the lead, and 16 leads on the live desk carry one. Adding it
 * moved exactly ONE lead, on `urban`; bhumi, delpat, raipur and skyline-realty
 * did not move at all, because none of their untouched leads had a follow-up
 * booked and nothing else.
 */
export const CONTACT_EVENT_TYPES = ['call', 'whatsapp', 'sms', 'email', 'remark', 'note', 'stage_change', 'follow_up'];
export const CONTACT_ACTIVITY_TYPES = ['call', 'meeting', 'site_visit'];

export const CONTACTED = sql`(
  EXISTS (SELECT 1 FROM crm_timeline_events e
           WHERE e.record_id = crm_leads.id AND e.tenant_id = crm_leads.tenant_id
             AND coalesce(e.author, 'System') <> 'System'
             AND e.type IN ${sql(CONTACT_EVENT_TYPES)})
  OR EXISTS (SELECT 1 FROM activities a
              WHERE a.lead_id = crm_leads.id AND a.tenant_id = crm_leads.tenant_id
                AND a.type IN ${sql(CONTACT_ACTIVITY_TYPES)})
)`;

/**
 * Nothing a person has done on this record for `days` days.
 *
 * Drives Going cold, and — since Settings → Assignment started asking the
 * question in days — the idle reassignment sweep as well. Those two were
 * different questions in different units: the pile said "nobody has recorded
 * anything", the sweep said `updated_at` was old, which a portal push or any
 * background stamp moves without a person having gone near the lead. A desk
 * that is told a lead is going cold and a desk that takes it off its owner have
 * to be answering the same question.
 *
 * `table` names the record's table, so the owner calling list can ask it too —
 * owner timeline rows live in the same crm_timeline_events, keyed by record_id.
 */
export const noPersonActivitySince = (days: number, table = 'crm_leads') => sql`
  NOT EXISTS (SELECT 1 FROM crm_timeline_events e
               WHERE e.record_id = ${sql(table)}.id AND e.tenant_id = ${sql(table)}.tenant_id
                 AND coalesce(e.author, 'System') <> 'System'
                 AND e.timestamp > now() - (${days}::text || ' days')::interval)`;

/**
 * WHEN A PERSON LAST DID SOMETHING ON THIS RECORD.
 *
 * The same guard as `noPersonActivitySince`, read forwards instead of
 * backwards, so "how long has this been quiet" and "is it going cold" cannot
 * answer differently. The sort key called `activity` ordered by `created_at`,
 * and the Going-cold panel labelled its rows from `updated_at` -- three names
 * for one idea, and the two visible ones were arrival time and a column any
 * background write touches. A lead worked this morning sorted as untouched.
 *
 * Falls back to arrival for a lead nobody has worked yet: it has been waiting
 * since it landed, which is the true answer and the one that sorts it first.
 */
export const lastPersonActivity = (table = 'crm_leads') => sql`
  coalesce((SELECT max(e.timestamp) FROM crm_timeline_events e
             WHERE e.record_id = ${sql(table)}.id AND e.tenant_id = ${sql(table)}.tenant_id
               AND coalesce(e.author, 'System') <> 'System'), ${sql(table)}.created_at)`;

/**
 * NOT HANDED ON IN THE LAST `days` DAYS.
 *
 * The idle reassignment sweep's second condition, and it is not optional.
 *
 * The sweep asks "has anyone done anything on this for N days", and a
 * reassignment is written by System — so it is not activity, so the lead is
 * still eligible the moment it lands on somebody new. On a five-minute timer
 * that is the same lead going round the rota every five minutes, for ever: one
 * record on the dev desk collected four hand-offs in six minutes.
 *
 * The old expression could not do this either, but it hid the problem — it read
 * `updated_at`, and the sweep's own UPDATE set `updated_at = NOW()`, so the
 * clock reset as a side effect of the write. Moving to "what a person did"
 * removed that accident and left the loop exposed.
 *
 * So the clock restarts on the hand-off itself: whoever has it now gets the
 * same N days to act that the last person got. Reassignment still never stops —
 * if nobody ever acts it moves again on the next window, which is what the desk
 * asked for — but a window is a window.
 */
export const notHandedOnSince = (days: number, table = 'crm_leads') => sql`
  NOT EXISTS (SELECT 1 FROM crm_timeline_events e
               WHERE e.record_id = ${sql(table)}.id AND e.tenant_id = ${sql(table)}.tenant_id
                 AND e.type = 'assignment'
                 AND e.timestamp > now() - (${days}::text || ' days')::interval)`;

/**
 * What the desk is told each pile is. `help` is one sentence in the firm's own
 * words, written HERE beside the SQL that decides it so that a meaning has one
 * home and a later reader can check a label against it.
 *
 * It is NOT sent to the client and nothing renders it. The product rule is
 * labels and values only — a pile is named, never captioned — so a `help`
 * string on screen would be explanatory UI copy. Serving it anyway would leave
 * a field travelling to a client that reads nothing, which is how the next
 * person picks it up and starts a second wording of the same meaning.
 *
 * `surface` says where a segment is allowed to appear. A segment with no pill
 * and no tile is reachable only by link, which is the fault that put the right
 * rows on screen with nothing naming why.
 */
export type SegmentSurface = 'pill' | 'tile' | 'internal';
export interface SegmentDef {
  key: string;
  label: string;
  help: string;
  surface: SegmentSurface[];
  tone?: 'alert';
}

// Every `help` below is what that pile MEANS, in one sentence. This is the one
// place a segment's meaning is written, beside the SQL that decides it. Change
// a meaning here or not at all — and when a label or a Settings sentence has to
// agree with a pile, this is what it is checked against.
export const SEGMENT_CATALOGUE: SegmentDef[] = [
  { key: 'today', label: 'Today', help: 'Arrived today.', surface: ['pill', 'tile'] },
  {
    key: 'never_contacted', label: 'Not contacted',
    // "Ever", and no clock — which is why this number moves only when somebody
    // works a lead or an unworked one arrives, while No reply and Going cold
    // move on their own overnight.
    help: 'Nobody has called, messaged, remarked, booked anything or moved it — ever.',
    surface: ['pill', 'tile'], tone: 'alert',
  },
  {
    key: 'going_cold', label: 'Going cold',
    help: 'Still open, and nobody has recorded anything on it for days.',
    surface: ['pill', 'tile'], tone: 'alert',
  },
  {
    key: 'overdue', label: 'Follow-up overdue',
    help: 'A booked follow-up whose time has passed.',
    surface: ['pill', 'tile'], tone: 'alert',
  },
  {
    key: 'repeat_enquiry', label: 'Came back',
    help: 'Enquired again after the first time.',
    surface: ['pill'],
  },
  // Reachable by link and by other screens, but not pills of their own — each
  // already has a control somewhere else, and two controls for one question is
  // how the pills and the old KPI strip started disagreeing.
  { key: 'unassigned', label: 'Nobody assigned', help: 'No agent on it.', surface: ['internal'] },
  { key: 'open', label: 'Open', help: 'Not rejected, not closed.', surface: ['internal'] },
  { key: 'closed', label: 'Closed', help: 'Rejected or deal closed.', surface: ['internal'] },
  { key: 'month', label: 'This month', help: 'Arrived this month, before today.', surface: ['internal'] },
  { key: 'noanswer', label: 'No answer', help: 'Sitting at Call Not Received.', surface: ['internal'] },
  { key: 'followup', label: 'Has a next step', help: 'A follow-up is booked.', surface: ['internal'] },
  // INTERNAL AGAIN, at the firm's request: no pill on the Leads list. The
  // predicate stays — the desk table still counts with it, and ?seg=no_next_step
  // still filters if something links to it — but nothing offers it as a pill.
  //
  // It was made a pill because two things linked to it and an entry point that
  // lands on rows with no control naming why is the same fault as one that
  // filters nothing. Both of those entry points went with it rather than being
  // left pointing at a filter the screen can no longer show: Today's group is
  // behind SHOW_QUIET, and the desk table's column is a number rather than a
  // link. Put the pill back and those become live again.
  { key: 'no_next_step', label: 'Nothing booked', help: 'Open, with nothing booked after it.', surface: ['internal'] },
];

/**
 * Labels for the client. The frontend renders these, it does not keep its own.
 *
 * `help` is deliberately not in here: nothing on screen renders a caption, and
 * a field that travels to a client which never reads it is one the next person
 * picks up.
 */
export const publicSegments = () =>
  SEGMENT_CATALOGUE.filter(s => !s.surface.includes('internal'))
    .map(({ key, label, surface, tone }) => ({ key, label, surface, tone: tone ?? null }));

/**
 * The predicates, built against the shared expressions store.ts already holds.
 *
 * Passed in rather than imported so this file can be read on its own without
 * pulling in the store — and so there is no import cycle between the two.
 */
export interface SegmentInputs {
  OPEN: any;
  FOLLOWUP_OVERDUE: any;
  newToday: any;
  monthStart: any;
  coldDays: number;
}

export function buildLeadSegments(p: SegmentInputs) {
  return {
    overdue: p.FOLLOWUP_OVERDUE,
    unassigned: sql`agent_id IS NULL`,
    open: p.OPEN,
    today: p.newToday,
    month: p.monthStart,
    noanswer: sql`stage = 'Call Not Received'`,
    closed: sql`NOT (${p.OPEN})`,
    followup: sql`follow_up IS NOT NULL`,

    // NOTHING BOOKED AFTER IT. The phone's biggest group by far -- 222 of
    // bhumi's 246 open leads -- and it had no destination at all: its "See all"
    // called go('leads') with an undefined filter, so the largest thing on an
    // agent's screen opened the unfiltered list.
    no_next_step: sql`(${p.OPEN} AND follow_up IS NULL)`,

    // NOT CONTACTED. No clock on it — "show me everyone nobody has reached out
    // to" is asked of the whole desk. The clocked version was `untouched_sla`,
    // labelled "Past SLA" on one screen and living beside this one on another;
    // it is gone, and this is the only expression left asking the question.
    never_contacted: sql`NOT ${CONTACTED}`,

    // GOING COLD. Open, and silent for the number of days the firm set in
    // Settings → Response times. THE ONLY CLOCKED PILE, on purpose.
    //
    // There was a second one — "No reply", leads sitting at Call Not Received
    // with nothing logged for N days — and it was 68 of Going cold's own 161 on
    // the live desk's shape, plus 6 that were only in it because `updated_at`
    // had moved without a person doing anything. Two piles asking one question,
    // one of them lying about 6 rows. Removed: step A's job was to reduce what
    // the desk has to hold in its head, and the desk asked for one number they
    // control — "treat a lead as gone cold after N days" — not two.
    //
    // Call Not Received is still a STATUS, so "show me the ones nobody
    // answered" is the Status control, which is where a question about a stage
    // belongs.
    going_cold: sql`(${p.OPEN} AND ${noPersonActivitySince(p.coldDays)})`,

    // CAME BACK. Counted in sessions, so a man who clicked four listings in five
    // minutes is not in it. They are the warmest people on the desk.
    repeat_enquiry: sql`(SELECT count(*) FROM crm_lead_enquiries e
                          WHERE e.tenant_id = crm_leads.tenant_id AND e.lead_id = crm_leads.id) > 1`,
  };
}

export type LeadSegment = keyof ReturnType<typeof buildLeadSegments>;

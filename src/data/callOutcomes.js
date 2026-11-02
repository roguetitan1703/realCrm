// ============================================================================
// WHAT HAPPENED — the outcome vocabularies, one per channel
// ============================================================================
// Every option below is here because bhumi's agents were already writing it in
// the free-text box. The lists were not designed; they were read off 101 call
// remarks and 41 message remarks and cut down to the clusters that recur.
//
// That matters because an option nobody needs is not neutral — it pushes the
// thing people DO mean into the remark box, where nothing can count it. 42 of
// bhumi's 189 calls carry an outcome. The other 147 were not silent: they said
// "Call not rec" and "Send details on wp" in prose, over and over, into a field
// no query can group by.
//
// `value` is the stable key and IS what gets stored on the timeline event;
// `label` is the only string ever shown, and renaming one is now safe.
//
// It was not always. Every control sent `o.label`, so metadata.outcome held
// "No answer" — display copy doing the work of a key. Two controls disagreed
// about the wording, so one column held two vocabularies; the auto-advance rule
// in routes/actions.ts had to regex English; and renaming an option would have
// orphaned every row already written. The 46 rows that existed were migrated to
// keys by 2026_08_18_outcome_keys (services/db.ts).
import { followUpKindOf } from './followUpKinds.js'

const o = (value, label, reach) => (reach ? { value, label, reach } : { value, label })

// `reach` is whether somebody picked up, and it is the ONLY place that is
// decided: the activity report's "answered" reads it, so an outcome added here
// without one is counted as nothing rather than guessed into a pile. A call is
// a tap on the button; only the outcome the caller wrote says anyone answered.
export const CALL_REACH = {
  answered: 'answered',
  no_answer: 'not received',
  unreachable: 'busy or off',
  wrong_number: 'wrong number',
  // Not a call's written outcome: no outcome written, and a WhatsApp's reach
  // (activityReport `contactOf`). One list so every report says them alike.
  no_outcome: 'result not written',
  replied: 'replied on WhatsApp',
  messaged: 'messaged, no reply',
}
/** Capitalised for a heading or legend. */
export const reachTitle = (k) => (CALL_REACH[k] || '').replace(/^./, c => c.toUpperCase())

export const CALL_OUTCOMES = [
  // ~15 remarks are a captured requirement typed as prose ("Looking 3bhk in
  // Mahalunge without broker", "Immi posse by Godrej Hill Retreet 2bhk
  // required") — the outcome is right, though the requirement belongs in the
  // req fields rather than a remark.
  o('discussed', 'Connected · discussed requirements', 'answered'),
  // ~9: "Coming today", "He will come tomorrow", "Coming For 1st Sep For Visit".
  o('visit', 'Interested · scheduling a site visit', 'answered'),
  // ~5: "Call Back Later", "Will call back later", "call him after a hour".
  o('callback', 'Asked to call back', 'answered'),
  // THE BIGGEST PILE BY FAR — about 42 remarks: "Call not rec" ×16,
  // "Call not received" ×9, "Call not Recived" ×8, "Call not tec", "Not rec",
  // "Call not answered", "Not responce", "Call cut".
  //
  // Note what they were typing: the STATUS name. The status is "Call Not
  // Received"; this option was called "No answer", so the words in the agent's
  // head were not in the dropdown and they reached for the free-text box
  // instead — 42 times. The option now says what they say. The key is unchanged,
  // so nothing that reads `no_answer` cares that the wording moved.
  o('no_answer', 'Call not received', 'no_answer'),
  // ~10: "Switch off", "Out of covrege", "Incoming are Band", and the three
  // "Talking with someone" / "Speaking to someone" — a line that is engaged.
  o('unreachable', 'Busy or switched off', 'unreachable'),
  // NEW — earned. ~10 remarks end this way and there was nowhere to put it:
  // "Send details on wp" (×6, usually appended to a requirement), "Sharing
  // details", "Details will share", "Whatapp message sent", "Call not rec
  // message sent on whataap". It is the commonest way a SUCCESSFUL call ends
  // on this desk, and every one of them was logged as an outcome-less call.
  o('details_sent', 'Sent details on WhatsApp', 'answered'),
  // NEW — earned, and it is not the same as "Not interested": the firm lost
  // this one to somebody else and that is worth being able to count.
  // "Requirement completed", "Booking other broker", "Done Bellier".
  o('booked_elsewhere', 'Already booked elsewhere', 'answered'),
  o('wrong_number', 'Wrong number', 'wrong_number'),
  // ~10: "Not looking" ×3, "Not required", "She said not interested don't call".
  o('not_interested', 'Not interested', 'answered'),
]

/**
 * What happened to a WhatsApp message.
 *
 * A separate list because a message does not end the way a call does — "No
 * answer" says nothing about one that has been delivered and not yet opened.
 *
 * All 221 WhatsApp events on the live desk carry NO outcome, because until now
 * no control ever asked for one. The 41 that carry a remark are what this list
 * is built from, and they are not the generic "replied / didn't reply" ladder
 * you would guess at — the dominant two are "I sent them the details" and "they
 * didn't pick up so I texted instead".
 */
export const WA_OUTCOMES = [
  // ~7: "Details shared on whatsapp" ×2, "Send details on wp" ×3, "Send details
  // on wo", plus the ones appended to a requirement.
  // `reach` on a WhatsApp: 'replied' when the person wrote back, 'messaged'
  // otherwise. The Performance page's contact status reads it (activityReport).
  o('wa_details_sent', 'Details shared', 'messaged'),
  // ~8, and this was invisible: "call not received" ×3, "Call not rec" ×2,
  // "Call not Recived" ×2, "Not rec texted on whatapp". Agents text the person
  // who did not pick up. That is a retry, not a cold message, and counting it
  // as one is how "no answer, not retried" overstates the abandoned pile.
  o('wa_after_no_answer', 'Sent after an unanswered call', 'messaged'),
  // "Looking baner side", "Required Fully furnished Flat For Blueridge only",
  // "Hello required in banerarea only", "He will require Flat for Air plan".
  o('wa_discussed', 'Replied · discussed requirements', 'replied'),
  // "Coming for visit on Sunday", "sunday visit", "Hello will come for Tommorow".
  o('wa_visit', 'Replied · coming for a visit', 'replied'),
  // ~10: "Not looking" ×5, "Not looking Currently", "He is not looking anymore",
  // "Budget are very low", "Booking other broker", "Direct owner thru".
  o('wa_not_looking', 'Replied · not looking', 'replied'),
  // "Not responding". The honest answer when nothing has come back yet, so an
  // agent with no news is never pushed into inventing some.
  o('wa_no_reply', 'No reply yet', 'messaged'),
]

// ── How a visit, a meeting or a demo ended ──────────────────────────────────
// Two copies of this existed: VISIT_OUTCOMES in Modals.jsx keyed on `key`, and
// VISIT_OUTCOME_LABEL in primitives.jsx as a plain map. Same five outcomes,
// two shapes, and neither knew about the other — so renaming one would have
// left the timeline rendering the raw key. One list, `value`/`label` like the
// two above it, because the same <select> renders all three.
//
// A follow-up that is not a call ends these ways too: an Online Demo or a
// Client Meeting finishes interested, negotiating, booked, not interested, or
// nobody turned up. That is why the timeline offers this list against a
// booking as well as against a logged visit.
export const VISIT_OUTCOMES = [
  o('interested', 'Interested'),
  o('negotiating', 'Negotiating'),
  o('booked', 'Booked'),
  o('not_interested', 'Not interested'),
  o('no_show', 'No show'),
]

// ============================================================================
// THE FIRM'S OWN WORDS — Settings → Outcomes
// ============================================================================
// The three lists above are the BUILT-INS. A firm's owner may rename one, hide
// one, reorder them, and add its own; that lives in crm_settings as
// `outcomes: { call?: [...], wa?: [...], visit?: [...] }`, each item
// `{ value, label?, reach?, hidden? }`. A channel the firm never edited is
// absent and reads as the built-ins — nothing is written to make that true.
//
// Built-ins cannot be deleted (history points at their keys) and their `reach`
// is theirs: "Call not received" is what the Performance page and the
// auto-advance count as nobody picking up, whatever the firm calls it. An
// outcome the firm adds carries a reach it chose, gets a key the server mints
// (`c_site_tour_1`), and is never deleted either — hidden is how it goes away,
// so a key is never reused for a different meaning.
//
// Every picker and every label reads these two functions, the browser through
// the table the store sets (setFirmOutcomes), the server through the settings
// row (outcomeListIn / outcomeLabelIn).
// ============================================================================

export const BUILTIN_OUTCOMES = { call: CALL_OUTCOMES, wa: WA_OUTCOMES, visit: VISIT_OUTCOMES }
export const OUTCOME_CHANNELS = ['call', 'wa', 'visit']
/** The reaches a firm may give an outcome it adds, per channel. */
export const REACH_CHOICES = { call: ['answered', 'no_answer', 'unreachable', 'wrong_number'], wa: ['replied', 'messaged'] }
/** Key prefix for an outcome a firm adds. */
export const ADDED_PREFIX = { call: 'c_', wa: 'w_', visit: 'v_' }

/**
 * Every outcome on a channel for a firm, hidden ones included (each carries
 * `hidden: true`), in the firm's order. `cfg` is the firm's settings object.
 */
export function outcomeListIn(cfg, channel) {
  const base = BUILTIN_OUTCOMES[channel] || []
  const stored = cfg?.outcomes?.[channel]
  if (!Array.isArray(stored)) return base.map(x => ({ ...x, builtin: true }))
  const seen = new Set()
  const out = []
  for (const s of stored) {
    if (!s || typeof s.value !== 'string' || seen.has(s.value)) continue
    const b = base.find(x => x.value === s.value)
    // A stored key that is neither built in nor added by the firm is not
    // something anybody can have picked — dropped rather than guessed at.
    if (!b && !s.value.startsWith(ADDED_PREFIX[channel])) continue
    seen.add(s.value)
    const label = String(s.label || '').trim() || b?.label || s.value
    const reach = b ? b.reach : s.reach
    out.push({ value: s.value, label, ...(reach ? { reach } : {}), ...(s.hidden ? { hidden: true } : {}), ...(b ? { builtin: true } : {}) })
  }
  // A built-in missing from what was stored is still a built-in.
  for (const b of base) if (!seen.has(b.value)) out.push({ ...b, builtin: true })
  return out
}

/** What a stored outcome reads as, for a firm. `channel` first when known; a raw string (rows from before keys) unchanged. */
export function outcomeLabelIn(cfg, value, channel) {
  if (!value) return ''
  const order = channel && OUTCOME_CHANNELS.includes(channel) ? [channel, ...OUTCOME_CHANNELS.filter(c => c !== channel)] : OUTCOME_CHANNELS
  for (const c of order) {
    const hit = outcomeListIn(cfg, c).find(x => x.value === value)
    if (hit) return hit.label
  }
  return value
}

/** Outcome keys on a channel, for a firm, whose reach is one of `reaches`. Hidden ones too: old rows still count. */
export const outcomeKeysByReach = (cfg, channel, ...reaches) =>
  outcomeListIn(cfg, channel).filter(x => reaches.includes(x.reach)).map(x => x.value)

/** Is `value` an outcome this firm has on this channel (hidden counts — it was once pickable)? */
export const isOutcomeIn = (cfg, channel, value) => outcomeListIn(cfg, channel).some(x => x.value === value)

/**
 * Which list a timeline entry is answered from. A booked follow-up that is a
 * CALL ends the way a call does — it offered the visit list ("No show") while
 * the call itself offered the call list. `line` is the entry's text, which
 * names the booking ("Follow-up Call, 20 Aug, 11:00 am").
 */
export function outcomeChannelOf(type, line) {
  if (type === 'call') return 'call'
  if (type === 'wa' || type === 'whatsapp' || type === 'sms') return 'wa'
  if (type === 'followup' || type === 'follow_up') return followUpKindOf(line) === 'call' ? 'call' : 'visit'
  if (type === 'visit' || type === 'site_visit' || type === 'meeting') return 'visit'
  return null
}

// The browser's copy, for this tab's workspace (one per tab: the URL is the
// authority), set by the store in render whenever the settings arrive — the
// same way stage names are (pipelineRoles.js setStageLabels).
let FIRM = {}
export function setFirmOutcomes(outcomes) { FIRM = { outcomes: outcomes && typeof outcomes === 'object' ? outcomes : undefined } }
/** What a picker offers: the firm's visible outcomes on a channel. `keep` keeps a hidden one that is already chosen. */
export const outcomeList = (channel, keep) => outcomeListIn(FIRM, channel).filter(x => !x.hidden || (keep && x.value === keep))
/** What a stored outcome reads as on screen. */
export const outcomeLabel = (value, channel) => outcomeLabelIn(FIRM, value, channel)

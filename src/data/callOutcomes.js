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
const o = (value, label) => ({ value, label })

export const CALL_OUTCOMES = [
  // ~15 remarks are a captured requirement typed as prose ("Looking 3bhk in
  // Mahalunge without broker", "Immi posse by Godrej Hill Retreet 2bhk
  // required") — the outcome is right, though the requirement belongs in the
  // req fields rather than a remark.
  o('discussed', 'Connected · discussed requirements'),
  // ~9: "Coming today", "He will come tomorrow", "Coming For 1st Sep For Visit".
  o('visit', 'Interested · scheduling a site visit'),
  // ~5: "Call Back Later", "Will call back later", "call him after a hour".
  o('callback', 'Asked to call back'),
  // THE BIGGEST PILE BY FAR — about 42 remarks: "Call not rec" ×16,
  // "Call not received" ×9, "Call not Recived" ×8, "Call not tec", "Not rec",
  // "Call not answered", "Not responce", "Call cut".
  //
  // Note what they were typing: the STATUS name. The status is "Call Not
  // Received"; this option was called "No answer", so the words in the agent's
  // head were not in the dropdown and they reached for the free-text box
  // instead — 42 times. The option now says what they say. The key is unchanged,
  // so nothing that reads `no_answer` cares that the wording moved.
  o('no_answer', 'Call not received'),
  // ~10: "Switch off", "Out of covrege", "Incoming are Band", and the three
  // "Talking with someone" / "Speaking to someone" — a line that is engaged.
  o('unreachable', 'Busy or switched off'),
  // NEW — earned. ~10 remarks end this way and there was nowhere to put it:
  // "Send details on wp" (×6, usually appended to a requirement), "Sharing
  // details", "Details will share", "Whatapp message sent", "Call not rec
  // message sent on whataap". It is the commonest way a SUCCESSFUL call ends
  // on this desk, and every one of them was logged as an outcome-less call.
  o('details_sent', 'Sent details on WhatsApp'),
  // NEW — earned, and it is not the same as "Not interested": the firm lost
  // this one to somebody else and that is worth being able to count.
  // "Requirement completed", "Booking other broker", "Done Bellier".
  o('booked_elsewhere', 'Already booked elsewhere'),
  o('wrong_number', 'Wrong number'),
  // ~10: "Not looking" ×3, "Not required", "She said not interested don't call".
  o('not_interested', 'Not interested'),
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
  o('wa_details_sent', 'Details shared'),
  // ~8, and this was invisible: "call not received" ×3, "Call not rec" ×2,
  // "Call not Recived" ×2, "Not rec texted on whatapp". Agents text the person
  // who did not pick up. That is a retry, not a cold message, and counting it
  // as one is how "no answer, not retried" overstates the abandoned pile.
  o('wa_after_no_answer', 'Sent after an unanswered call'),
  // "Looking baner side", "Required Fully furnished Flat For Blueridge only",
  // "Hello required in banerarea only", "He will require Flat for Air plan".
  o('wa_discussed', 'Replied · discussed requirements'),
  // "Coming for visit on Sunday", "sunday visit", "Hello will come for Tommorow".
  o('wa_visit', 'Replied · coming for a visit'),
  // ~10: "Not looking" ×5, "Not looking Currently", "He is not looking anymore",
  // "Budget are very low", "Booking other broker", "Direct owner thru".
  o('wa_not_looking', 'Replied · not looking'),
  // "Not responding". The honest answer when nothing has come back yet, so an
  // agent with no news is never pushed into inventing some.
  o('wa_no_reply', 'No reply yet'),
]

// Both lists, one lookup. A caller asking for the label of an outcome should
// not have to know which channel produced it.
export const labelForOutcome = (value) =>
  [...CALL_OUTCOMES, ...WA_OUTCOMES].find(x => x.value === value)?.label || ''

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

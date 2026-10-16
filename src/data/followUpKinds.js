// ============================================================================
// WHAT A BOOKED FOLLOW-UP IS, AND WHAT FINISHES IT
// ============================================================================
// The schedule form offers the four ACTIONS; every booking stores one of them
// in `follow_up.action` (older rows: free text, sometimes "<kind> — <name>").
//
// Each kind is finished by doing the work it booked, and the server closes the
// booking in the same write (closeFollowUpFor / completeFollowUp, store.ts):
//
//   call     the call is logged            Today's row: Call
//   visit    the visit is logged, proven   Today's row: Log visit (VisitProofModal)
//   meeting  how it went is recorded       Today's row: Done (FollowUpDoneModal)
//
// A booking whose text names none of these is finished the way a meeting is.
// Read by the browser and by the server, so the button on the row and the rule
// that closes the booking cannot disagree about what a booking is.
// ============================================================================

export const FOLLOW_UP_ACTIONS = ['Site Visit', 'Client Meeting', 'Follow-up Call', 'Online Demo']

// In this order: "Site visit call-back" is a visit, "Client meeting call" a meeting.
const KINDS = [
  { kind: 'visit', match: /site\s*visit/i, finish: 'visit', label: 'Log visit' },
  { kind: 'meeting', match: /meeting|demo/i, finish: 'outcome', label: 'Done' },
  { kind: 'call', match: /call|callback/i, finish: 'call', label: 'Call' },
]
const OTHER = { kind: null, finish: 'outcome', label: 'Done' }

/** 'visit' | 'meeting' | 'call', or null for a booking that names none. */
export function followUpKindOf(action) {
  const a = String(action || '')
  return KINDS.find(k => k.match.test(a))?.kind || null
}

/** How Today finishes this booking: { finish: 'call'|'visit'|'outcome', label }. */
export function followUpFinish(fu) {
  const kind = followUpKindOf(fu?.action)
  const k = KINDS.find(x => x.kind === kind) || OTHER
  return { finish: k.finish, label: k.label }
}

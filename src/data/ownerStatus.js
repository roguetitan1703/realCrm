// Owner cold-calling status — flat, like leadStatus.js, but a much shorter
// list: this is "did we reach them, will they let us manage the flat", not a
// buyer funnel. Kept in its own file rather than folded into leadStatus.js
// because an owner and a lead are different records with different
// vocabularies (see the OWNERS block in backend/src/services/store.ts).
//
// THE SHAPE, decided with the client 2026-09-23:
//   • the walk forward is four steps and ends at KEY RECEIVED — the flat is
//     ours to manage, which is the whole point of the call;
//   • "Callback" left the list. A callback is a TIME, held in callback_at and
//     shown as its own pill and its own sort; as a status it said nothing about
//     the conversation and a record could be "Callback" with no callback on it;
//   • the two endings are reached through Reject, with a reason, exactly as a
//     lead is — they are not steps forward and do not belong in the same walk.
//
// The three "did not get through" statuses were added 2026-10-03 because a
// client's callers asked for them by name, and Mahalaxmi's sheet already used
// those words. Before that, every unanswered dial showed as Contacted, the same
// as an owner who had actually been spoken to.

/** The progression, in order — what the status dropdown offers. */
export const OWNER_STAGES = [
  'New',
  'Call Not Received',
  'Incoming Not Available',
  'Switch Off',
  'Contacted',
  'Interested',
  'Key Received',
]

/** The endings. Set through Reject (with a reason), never by walking forward. */
export const OWNER_TERMINAL_STATUSES = ['Not Interested', 'Do Not Call']

/** Every status a record may hold — the vocabulary, for filters and counts. */
export const OWNER_STATUSES = [...OWNER_STAGES, ...OWNER_TERMINAL_STATUSES]

/** Why a calling record ends, and where it lands. The reason is kept as a
 *  remark; the status is one of the two endings. */
export const OWNER_REJECTION_REASONS = [
  { reason: 'Said not interested', status: 'Not Interested' },
  { reason: 'Not selling or renting', status: 'Not Interested' },
  { reason: 'Already with another agency', status: 'Not Interested' },
  { reason: 'Asked us not to call again', status: 'Do Not Call' },
  { reason: 'Wrong number', status: 'Do Not Call' },
  { reason: 'Never answers', status: 'Not Interested' },
]

export const isOwnerOpen = (s) => !OWNER_TERMINAL_STATUSES.includes(String(s || ''))

/**
 * WHAT A SPREADSHEET'S "CALL STATUS" MEANS, in our statuses.
 *
 * Written against the words a real client's sheets actually use — Mahalaxmi's
 * Call Status and Feedback columns, 1,204 rows, read 24 Sep — typos included,
 * because "not intrested" (281 rows) and "intrested" (39) ARE the data:
 *
 *   wrong no · invalid                               → Do Not Call  (Wrong number)
 *   not intrested · already flat on rent             → Not Interested
 *   intrested · intrested they will call when …      → Interested
 *   not received · cnr                               → Call Not Received
 *   incoming not avilable                            → Incoming Not Available
 *   switch off                                       → Switch Off
 *   received · call cut · busy · voice note ·
 *   not available · cnc (not connected)              → Contacted
 *
 * Anything else — "possession after 2/3 months", "reapet no.", a note about
 * where the key is — is NOT guessed at. It returns null, the row keeps its
 * status, and the words go onto the record as a note, so nothing a caller
 * wrote is lost or turned into a claim it did not make.
 *
 * Order matters: "not interested" must be tried before "interested", and
 * "wrong" before everything, since a wrong number is the end of it.
 */
export function statusFromSheet(text) {
  const w = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!w) return null
  if (/\bwrong\b|\binvalid\b/.test(w)) return { status: 'Do Not Call', reason: 'Wrong number' }
  if (/\bnot int[a-z]*st/.test(w)) return { status: 'Not Interested', reason: 'Said not interested (from the sheet)' }
  if (/\balready\b.*\b(rent|rented|sold)\b/.test(w)) return { status: 'Not Interested', reason: 'Already rented or sold (from the sheet)' }
  if (/^int[a-z]*st/.test(w)) return { status: 'Interested', reason: null }
  if (/\bincoming\b/.test(w)) return { status: 'Incoming Not Available', reason: null }
  if (/\bswitch(ed)? ?off\b/.test(w)) return { status: 'Switch Off', reason: null }
  if (/\bnot rec[a-z]*\b|^cnr$|\bno answer\b/.test(w)) return { status: 'Call Not Received', reason: null }
  if (/\breceived\b|\bcall cut\b|\bbusy\b|\bvoice note\b|\bnot a[a-z]*ble\b|^cnc$|\bnot reachable\b|\bunreachable\b|\bringing\b/.test(w)) {
    return { status: 'Contacted', reason: null }
  }
  return null
}

/**
 * THE CALLING LIST'S PILES, as the server names them (state.ownerSegments,
 * from backend/src/services/leadSegments.ts — the predicate and the label sit
 * together there). This list is only the fallback for an API older than this
 * build; when the two disagree, the server is right.
 */
export const OWNER_SEGMENT_FALLBACK = [
  { key: 'callbacks_overdue', label: 'Callbacks overdue', surface: ['pill', 'tile'], tone: 'alert' },
  { key: 'callbacks_today', label: 'Callbacks later today', surface: ['pill', 'tile'] },
  { key: 'callbacks', label: 'Callbacks', surface: ['pill'] },
  { key: 'unassigned', label: 'Unassigned', surface: ['pill', 'tile'] },
]
export const ownerSegmentsOf = (state) =>
  (state?.ownerSegments?.length ? state.ownerSegments : OWNER_SEGMENT_FALLBACK)
export const ownerSegLabel = (state, key) =>
  ownerSegmentsOf(state).find(s => s.key === key)?.label
  || OWNER_SEGMENT_FALLBACK.find(s => s.key === key)?.label || key
/** The tabs whose list is about a callback time: sorted soonest first, with the time as a column. */
export const isCallbackTab = (tab) => String(tab || '').startsWith('callbacks')

/**
 * WHERE A LINK INTO CALLING LANDS. Every callback figure opens the pill of its
 * own segment, so the figure and the list are one predicate; "never called"
 * opens the New tab (a status, not a dial: the two differ, and the name waits
 * on the firm). One map, so the screens that link in cannot land on different
 * tabs for the same figure.
 */
export function callingFiltersFor(segment) {
  if (['callbacks_overdue', 'callbacks_today', 'callbacks', 'unassigned'].includes(segment)) return { tab: segment }
  if (segment === 'to_call' || segment === 'never_called') return { step: 'New' }
  return undefined
}

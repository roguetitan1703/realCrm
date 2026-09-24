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

/** The progression, in order — what the status dropdown offers. */
export const OWNER_STAGES = [
  'New',
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
 *   not received · received · call cut · busy ·
 *   incoming not avilable · switch off · voice note ·
 *   not available · cnc (not connected) · cnr        → Contacted
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
  if (/\b(not )?received\b|\bcall cut\b|\bbusy\b|\bincoming\b|\bswitch(ed)? ?off\b|\bvoice note\b|\bnot a[a-z]*ble\b|^cn[cr]$|\bnot reachable\b|\bunreachable\b|\bno answer\b|\bringing\b/.test(w)) {
    return { status: 'Contacted', reason: null }
  }
  return null
}

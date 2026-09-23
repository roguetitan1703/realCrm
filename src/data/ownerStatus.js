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

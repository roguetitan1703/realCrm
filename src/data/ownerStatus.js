// Owner cold-calling status — flat, like leadStatus.js, but a much shorter
// list: this is "did we reach them, do they want to sell/rent", not a buyer
// funnel. Kept in its own file rather than folded into leadStatus.js because
// an owner and a lead are different records with different vocabularies (see
// the OWNERS block in backend/src/services/store.ts for the full reasoning).
export const OWNER_STATUSES = [
  'New',
  'Contacted',
  'Callback',
  'Interested',
  'Not Interested',
  'Do Not Call',
]

export const OWNER_TERMINAL_STATUSES = ['Not Interested', 'Do Not Call']

export const isOwnerOpen = (s) => !OWNER_TERMINAL_STATUSES.includes(String(s || ''))

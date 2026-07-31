// One place that answers "may this role do this?", so a screen and the server
// can't disagree. This is the UI half — it decides what renders. The server
// enforces the same rule independently (backend/src/lib/permissions.ts);
// hiding a button is not a permission.
//
// The line is deliberately drawn between CHANGING a record's facts and
// APPENDING to its history. An agent may always append — remark, call log,
// visit log, shortlist, share, schedule — because that is the field job and
// blocking it would cost the firm the data it is buying. What an agent may not
// do is rewrite a listing's price, status or owner: those are desk facts, and a
// wrong one goes out to every buyer.

const DESK_ROLES = ['admin', 'owner', 'manager']

export function canEditListing(role) {
  return DESK_ROLES.includes(role)
}

// Appending to a record's history. Always true for a signed-in user — it exists
// as a named function so a future caller asks the question rather than assuming
// the answer, and so the rule has one home.
export function canLogActivity() {
  return true
}

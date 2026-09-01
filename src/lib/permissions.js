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

// ADDING is not REWRITING — mirrors canAddListing() in
// backend/src/lib/permissions.ts, which is what actually enforces it. An agent
// standing in the flat can put it on the book; changing a live listing's price
// or status stays with the desk, and `createdBy` records who added it.
export function canAddListing(role) {
  return !!role
}

// Deleting or merging a record destroys history, so it is the owner's call —
// mirrors canDeleteRecord() in backend/src/lib/permissions.ts.
export function canDeleteRecord(role) {
  return role === 'admin' || role === 'owner'
}

// Appending to a record's history. Always true for a signed-in user — it exists
// as a named function so a future caller asks the question rather than assuming
// the answer, and so the rule has one home.
export function canLogActivity() {
  return true
}

export function isDeskRole(role) {
  return DESK_ROLES.includes(role) || role === 'superadmin'
}

// ── What a role is CALLED ───────────────────────────────────────────────────
// One place, because the same person was reading "Sales Executive" on the web
// top bar and "Field agent" on their phone, while the database said `agent` and
// the firm says agent out loud. Three names for one job, none of them the one
// people use.
//
// THE ROLE, CALLED WHAT THE DATA CALLS IT.
//
//   owner     the account the workspace is created against — one per firm, and
//             the billing email. `admin` is a legacy alias that exists in the
//             code and on no real tenant.
//   manager   everything the owner can see and do, minus being the billing
//             account. Created by the firm, any number.
//   agent     the field. Created by the firm.
const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Owner',
  manager: 'Manager',
  agent: 'Agent',
  superadmin: 'Delpat',
}

export function roleLabel(role) {
  return ROLE_LABELS[String(role || '').toLowerCase()] || 'Agent'
}

// ── A sales executive's scope on one lead ───────────────────────────────────
// Mirrors assertLeadWrite() in backend/src/lib/permissions.ts. The server is
// what enforces this; these two decide what to render, so that an agent is not
// shown an Edit button that will come back 403.
//
// CREATED is what grants authorship, not ASSIGNED. A lead handed to you is a
// lead you work, not a lead you own: you move its status and add remarks, and
// the buyer's name, number, budget and requirement stay as the desk entered
// them. Reassignment is a desk action either way.

/** May this user rewrite the lead's facts — name, phone, budget, requirement? */
export function canEditLead(role, userId, lead) {
  if (isDeskRole(role)) return true
  if (role !== 'agent' || !userId || !lead) return false
  return !!lead.createdBy && lead.createdBy === userId
}

/** May this user change the status or add to the history? */
export function canUpdateLeadStatus(role, userId, lead) {
  if (isDeskRole(role)) return true
  if (role !== 'agent' || !userId || !lead) return false
  return lead.createdBy === userId || lead.agentId === userId
}

/** Assigning a lead to someone is a desk action, whoever created it. */
export function canAssignLead(role) {
  return isDeskRole(role)
}

/**
 * The authoritative permission rules. src/lib/permissions.js mirrors these to
 * decide what renders; this file decides what is allowed. They must agree, but
 * only this one is enforcement — a client that hides a button is a client that
 * can be modified.
 *
 * The line is between CHANGING a record's facts and APPENDING to its history.
 * An agent may always append: remark, call log, visit log, shortlist, share,
 * follow-up. That is the field job, and the firm is paying for exactly that
 * data. What an agent may not do is rewrite a listing — price, status, owner —
 * because a wrong one there goes out to every buyer under the firm's name.
 */

const DESK_ROLES = new Set(['owner', 'admin', 'manager', 'superadmin']);

export function canEditListing(role?: string | null): boolean {
  return !!role && DESK_ROLES.has(role);
}

export function canDeleteRecord(role?: string | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'superadmin';
}

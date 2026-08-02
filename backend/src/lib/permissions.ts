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

export function isDeskRole(role?: string | null): boolean {
  return !!role && DESK_ROLES.has(role);
}

/**
 * ── A sales executive's scope on a lead ──────────────────────────────────────
 *
 * Three cases, and the difference between the first two is the whole point:
 *
 *   created by them   → full edit. It is their record.
 *   assigned to them  → status and remarks only. They work the lead; they do
 *                       not get to rewrite the buyer's name, phone, budget or
 *                       requirement, and they do not get to hand it to someone
 *                       else. Those are the facts the desk answers for.
 *   neither           → nothing. Not visible, not editable.
 *
 * CREATED, not assigned, is what grants authorship — a lead you were handed is
 * not a lead you own. Reassignment is excluded from the append set on purpose:
 * an agent moving leads between people is how a pipeline quietly gets rewritten.
 */

// What an assignee may change on a lead that is not theirs: the status, and the
// record's history. Everything else is a fact about the buyer or the deal.
const ASSIGNEE_WRITABLE = new Set([
  'stage', 'rejectionReason', 'rejection_reason',
  'notes', 'timeline', 'followUp', 'follow_up', 'overdue',
  'shortlist', 'feedback',
]);

export class ForbiddenError extends Error {
  status = 403;
  code = 'FORBIDDEN';
  constructor(message: string) { super(message); this.name = 'ForbiddenError'; }
}

/**
 * Throws unless `role`/`userId` may apply `patch` to `lead`. Desk roles and
 * system callers (imports, webhooks, seeds — role null) pass through; only an
 * agent is scoped.
 */
export function assertLeadWrite(
  role: string | null | undefined,
  userId: string | null | undefined,
  lead: { agentId?: string | null; createdBy?: string | null; name?: string },
  patch: Record<string, any>,
): void {
  if (role !== 'agent') return;               // desk, superadmin, or system
  if (!userId) throw new ForbiddenError('Not signed in.');

  if (lead.createdBy && lead.createdBy === userId) return;   // their own record

  if (lead.agentId && lead.agentId === userId) {
    const denied = Object.keys(patch).filter(k => !ASSIGNEE_WRITABLE.has(k));
    if (denied.length === 0) return;
    throw new ForbiddenError(
      `This lead was created by someone else, so you can change its status and remarks but not ${denied.join(', ')}.`,
    );
  }

  throw new ForbiddenError('This lead belongs to another team member.');
}

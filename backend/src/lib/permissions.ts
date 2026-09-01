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

/**
 * ADDING a listing is not the same act as REWRITING one.
 *
 * The rule above exists because a wrong price or status on a live listing goes
 * out to every buyer under the firm's name. Creating a row carries none of that
 * risk: there is no existing figure to overwrite and nobody is quoting it yet.
 * Blocking it cost the firm the thing it is paying for — an agent standing in a
 * flat, with the owner in front of them, could not put it on the book, so it
 * arrived later as a note to a manager or not at all.
 *
 * Every signed-in employee may add. Editing stays with the desk, and
 * `created_by` records who added each one so the desk can go back and ask.
 */
export function canAddListing(role?: string | null): boolean {
  return !!role;
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
  // `stageNote` is the note attached to a status change, not a column. An
  // assignee may change the status and may add remarks, so they may say WHY
  // they changed it — refusing the note while allowing the change is a
  // distinction with nothing behind it.
  'stage', 'stageNote', 'rejectionReason', 'rejection_reason',
  'notes', 'timeline', 'followUp', 'follow_up', 'overdue',
  'shortlist', 'feedback',
]);

// The refused fields are shown to the person who tried, so they read as things
// on the screen rather than as column names.
const FIELD_LABEL: Record<string, string> = {
  name: 'the name', phone: 'the phone number', email: 'the email',
  agentId: 'who it is assigned to', agent_id: 'who it is assigned to',
  source: 'the source', req: 'the requirement', requirement: 'the requirement',
  locality: 'the locality', deal: 'the deal type', purpose: 'the purpose',
  budgetMin: 'the budget', budgetMax: 'the budget',
  budget_min: 'the budget', budget_max: 'the budget',
  timeline_pref: 'the timeline', delete: 'deleting it',
};
const labelFields = (keys: string[]) => {
  const seen = [...new Set(keys.map(k => FIELD_LABEL[k] || `\`${k}\``))];
  if (seen.length === 1) return seen[0];
  return `${seen.slice(0, -1).join(', ')} or ${seen[seen.length - 1]}`;
};

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
    // A KEY THAT IS PRESENT BUT UNDEFINED IS STILL A KEY. `Object.keys({stage,
    // stageNote: undefined})` is ['stage','stageNote'], so a caller that always
    // spreads an optional field had it counted as an attempt to write that
    // field — and was refused for sending nothing. Judge what is actually being
    // set, not what the object happens to mention.
    const denied = Object.keys(patch)
      .filter(k => patch[k] !== undefined)
      .filter(k => !ASSIGNEE_WRITABLE.has(k));
    if (denied.length === 0) return;
    throw new ForbiddenError(
      `This lead was created by someone else. You can change its status and add remarks, but not ${labelFields(denied)}.`,
    );
  }

  throw new ForbiddenError('This lead belongs to another team member.');
}

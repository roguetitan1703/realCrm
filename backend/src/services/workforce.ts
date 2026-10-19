/**
 * ============================================================================
 * WHO CAN TAKE WORK — the one definition (CLAUDE.md §3.2)
 * ============================================================================
 * A person can be given a lead or an owner when they have a users row in that
 * firm, it is not deleted, and its status is active (ILIKE: onboarding writes
 * 'ACTIVE', the team screen 'active'). Not suspended, not removed, and never
 * an id with no account behind it — a crm_agents row alone is history, kept so
 * old attribution still resolves.
 *
 * There were three answers before: the rota's users join, the desk's bulk
 * assign (anything not 'suspended', so an invited or blank status passed) and
 * the agent list behind the pickers (suspended people and account-less agents
 * included). The rota then skipped people the Settings picker offered, and the
 * empty-rota fallback could hand a lead to someone suspended.
 *
 * ON DUTY is the other half, used only where the firm has not chosen a rota:
 * crm_agents.duty_status, off duty and on leave excluded.
 * ============================================================================
 */
import { sql } from './db.js';

/** SQL: the person `id` (a fragment) can take work in tenant `tenantId`. */
export const canTakeWork = (tenantId: unknown, id: unknown) => sql`EXISTS (
  SELECT 1 FROM users cw WHERE cw.tenant_id = ${tenantId as any} AND cw.id = ${id as any}
     AND cw.deleted_at IS NULL AND cw.status ILIKE 'active')`;

/** SQL over a crm_agents row aliased `a`: not off duty, not on leave. */
export const ON_DUTY = sql`coalesce(a.duty_status, 'ACTIVE') NOT IN ('OFF_DUTY', 'ON_LEAVE')`;

/**
 * Handing work to a NAMED person who cannot take it is refused, never quietly
 * done or quietly dropped: a lead given to someone suspended or removed sits
 * with nobody who can open it. Routes answer 422 `not_workable` with the name.
 */
export class NotWorkableError extends Error {
  status = 422;
  code = 'not_workable';
  constructor(public personId: string, public personName: string | null) {
    super(`${personName || 'That person'} cannot be given work.`);
    this.name = 'NotWorkableError';
  }
}

/** Throws NotWorkableError for the first of these ids (in the order given) that cannot take work. */
export async function assertWorkable(tenantId: string, ids: (string | null | undefined)[], q: any = sql): Promise<void> {
  const clean = [...new Set(ids.filter(Boolean).map(String))];
  if (!clean.length) return;
  // `q` is a transaction when the check guards writes in one: re-checked there,
  // a person suspended between the first check and the writes undoes them all.
  const bad = await q`
    SELECT x.id, coalesce(u.name, a.name) AS name FROM unnest(${clean}::text[]) AS x(id)
      LEFT JOIN users u ON u.tenant_id = ${tenantId} AND u.id = x.id
      LEFT JOIN crm_agents a ON a.tenant_id = ${tenantId} AND a.id = x.id
     WHERE NOT ${canTakeWork(tenantId, sql`x.id`)}`;
  if (!bad.length) return;
  const first = clean.find(id => (bad as any[]).some(r => r.id === id))!;
  throw new NotWorkableError(first, (bad as any[]).find(r => r.id === first)?.name ?? null);
}

/** The 422 body for a NotWorkableError, or null for any other error. */
export function notWorkableBody(err: any): { success: false; error: 'not_workable'; name: string | null; message: string } | null {
  return err instanceof NotWorkableError
    ? { success: false, error: 'not_workable', name: err.personName, message: err.message }
    : null;
}

/** Everyone who can take work and is on duty: the pool when a firm has no rota. */
export async function onDutyWorkers(tenantId: string): Promise<string[]> {
  const rows = await sql`
    SELECT a.id FROM crm_agents a
     WHERE a.tenant_id = ${tenantId} AND ${ON_DUTY} AND ${canTakeWork(tenantId, sql`a.id`)}
     ORDER BY a.id`;
  return (rows as any[]).map(r => r.id);
}

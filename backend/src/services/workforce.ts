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

/** Which of these ids can take work, in the order given. */
export async function workableIds(tenantId: string, ids: string[]): Promise<string[]> {
  const clean = [...new Set(ids.map(String).filter(Boolean))];
  if (!clean.length) return [];
  const rows = await sql`SELECT x.id FROM unnest(${clean}::text[]) AS x(id) WHERE ${canTakeWork(tenantId, sql`x.id`)}`;
  const ok = new Set((rows as any[]).map(r => r.id));
  return ids.map(String).filter(id => ok.has(id));
}

/** Everyone who can take work and is on duty: the pool when a firm has no rota. */
export async function onDutyWorkers(tenantId: string): Promise<string[]> {
  const rows = await sql`
    SELECT a.id FROM crm_agents a
     WHERE a.tenant_id = ${tenantId} AND ${ON_DUTY} AND ${canTakeWork(tenantId, sql`a.id`)}
     ORDER BY a.id`;
  return (rows as any[]).map(r => r.id);
}

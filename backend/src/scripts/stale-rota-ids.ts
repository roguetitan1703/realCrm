/**
 * ============================================================================
 * STALE ROTA IDS — who is on a firm's lead rota but cannot take a lead
 * ============================================================================
 * Counts, per tenant, the ids in crm_routing_rules.active_agent_ids (leads)
 * and owner_active_agent_ids (owners) that are not an active user of that
 * firm: no users row, deleted, or not active. Before review 4, nextRoutedAgent()
 * handed portal leads to such ids and they sat under "a former member" until
 * the sweep moved them. Routing now skips them; the stored list is untouched,
 * so this says how many firms still carry dead names (and which).
 *
 * READ-ONLY. One connection, a read-only transaction, and it refuses to run
 * against the development database. Writes nothing.
 *
 * When to run: once Om approves production reads — to size how many portal
 * leads were affected, and after anyone edits a rota by hand. Also prints each
 * firm's saved strategies: a saved 'manual' was never read before 20 Oct.
 *
 * Usage (from the repo root):
 *   npx tsx --env-file=.env backend/src/scripts/stale-rota-ids.ts
 */
import postgres from 'postgres';
import { pgOptions } from '../services/pgOptions.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL (production) is not set.');
if (process.env.DEV_DATABASE_URL && url === process.env.DEV_DATABASE_URL) {
  throw new Error('DATABASE_URL is the development database. This script is for production.');
}
// READ ONLY inside the transaction: the Supabase pooler drops the
// default_transaction_read_only startup parameter, so it never protected anything.
const sql = postgres(url, pgOptions(url, { max: 1 }));

try {
  await sql.begin('READ ONLY', async (sql) => {
  const rows = await sql`
    WITH ids AS (
      SELECT r.tenant_id, 'leads' AS pool, x.id
        FROM crm_routing_rules r, jsonb_array_elements_text(coalesce(r.active_agent_ids, '[]'::jsonb)) AS x(id)
      UNION ALL
      SELECT r.tenant_id, 'owners', x.id
        FROM crm_routing_rules r, jsonb_array_elements_text(coalesce(r.owner_active_agent_ids, '[]'::jsonb)) AS x(id)
    )
    SELECT i.tenant_id, i.pool, count(*)::int AS on_rota,
           count(*) FILTER (WHERE u.id IS NULL OR u.deleted_at IS NOT NULL OR u.status NOT ILIKE 'active')::int AS stale,
           array_agg(i.id) FILTER (WHERE u.id IS NULL OR u.deleted_at IS NOT NULL OR u.status NOT ILIKE 'active') AS stale_ids
      FROM ids i LEFT JOIN users u ON u.tenant_id = i.tenant_id AND u.id = i.id
     GROUP BY 1, 2 ORDER BY 1, 2`;
  for (const r of rows as any[]) {
    console.log(`${r.tenant_id} ${r.pool}: ${r.stale} stale of ${r.on_rota}${r.stale ? ` (${r.stale_ids.join(', ')})` : ''}`);
  }
  if (!rows.length) console.log('No rota rows.');

  // Whether each firm's saved strategy will hand out work once "Leave
  // unassigned" is honoured (before, a saved 'manual' was never read).
  const rules = await sql`
    SELECT tenant_id, strategy, sweep_unassigned_enabled, reassign_idle_enabled,
           owner_strategy, owner_sweep_unassigned_enabled, owner_reassign_idle_enabled
      FROM crm_routing_rules ORDER BY tenant_id`;
  for (const r of rules as any[]) {
    console.log(`${r.tenant_id} leads=${r.strategy} sweep=${r.sweep_unassigned_enabled} idle=${r.reassign_idle_enabled}`
      + ` | owners=${r.owner_strategy} sweep=${r.owner_sweep_unassigned_enabled} idle=${r.owner_reassign_idle_enabled}`);
  }
  });
} finally {
  await sql.end();
}

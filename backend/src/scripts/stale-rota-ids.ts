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
 * leads were affected, and after anyone edits a rota by hand.
 *
 * Usage (from the repo root, production DATABASE_URL in the environment):
 *   npx tsx backend/src/scripts/stale-rota-ids.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL (production) is not set.');
if (process.env.DEV_DATABASE_URL && url === process.env.DEV_DATABASE_URL) {
  throw new Error('DATABASE_URL is the development database. This script is for production.');
}
const sql = postgres(url, { max: 1, ssl: 'require', connection: { default_transaction_read_only: true } as any });

try {
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
} finally {
  await sql.end();
}

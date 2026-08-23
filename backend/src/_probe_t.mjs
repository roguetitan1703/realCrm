// DEVELOPMENT ONLY. Arms the idle sweep on skyline-realty (the demo tenant, 11
// open leads) so the loop fix can be watched on a real tick. Records the prior
// values so they can be put back exactly.
import postgres from 'postgres';
const sql = postgres(process.env.PROBE_URL, { max: 1, ssl: 'require' });
const T = 'skyline-realty';
const before = (await sql`select strategy, active_agent_ids, reassign_idle_enabled, reassign_idle_days,
                                 reassign_alert_count, last_assigned_index
                          from crm_routing_rules where tenant_id = ${T}`)[0];
console.log('before:', JSON.stringify(before));
if (process.argv.includes('--arm')) {
  const ids = (await sql`select a.id from crm_agents a join users u on u.id = a.id and u.deleted_at is null
                         where a.tenant_id = ${T} order by a.name`).map(r => r.id);
  await sql`update crm_routing_rules
            set reassign_idle_enabled = true, reassign_idle_days = 4,
                active_agent_ids = ${sql.json(ids)}
            where tenant_id = ${T}`;
  console.log('armed with rota:', ids);
}
if (process.argv.includes('--disarm')) {
  await sql`update crm_routing_rules
            set reassign_idle_enabled = ${before.reassign_idle_enabled},
                active_agent_ids = ${sql.json(before.active_agent_ids)},
                reassign_idle_days = ${before.reassign_idle_days}
            where tenant_id = ${T}`;
  console.log('put back');
}
const ev = await sql`select count(*)::int n, count(distinct record_id)::int recs, max(timestamp) last
                     from crm_timeline_events where tenant_id = ${T} and type = 'assignment'
                       and metadata->>'reason' = 'sweep_idle'`;
console.log('sweep_idle events on this tenant:', ev[0]);
await sql.end();

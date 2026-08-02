import { migrateLeadStatuses } from './backend/src/services/store';
import { sql } from './backend/src/services/db';
await new Promise(r => setTimeout(r, 3000));
await migrateLeadStatuses();
const r = await sql`SELECT stage, count(*)::int n FROM crm_leads GROUP BY 1 ORDER BY 2 DESC`;
console.log('leads by status:', JSON.stringify(r.map((x:any)=>[x.stage,x.n])));
const st = await sql`SELECT tenant_id, value->'stages' AS stages FROM crm_settings WHERE key='default'`;
for (const x of st as any[]) console.log(' settings', x.tenant_id, JSON.stringify(x.stages));
process.exit(0);

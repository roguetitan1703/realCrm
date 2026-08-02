import { sql } from './backend/src/services/db';
await new Promise(r => setTimeout(r, 2500));
const r = await sql`SELECT stage, count(*)::int n FROM crm_leads GROUP BY 1 ORDER BY 2 DESC LIMIT 12`;
console.log('LEADS BY STATUS:', JSON.stringify(r.map((x:any)=>[x.stage,x.n])));
process.exit(0);

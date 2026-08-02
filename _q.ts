import { sql } from './backend/src/services/db';
const t = await sql`SELECT id, slug, name FROM tenants ORDER BY created_at`;
console.log('TENANTS:', t.map((r: any) => `${r.id} / ${r.slug} / ${r.name}`));
for (const row of t as any[]) {
  const a = await sql`
    SELECT a.id, a.duty_status, u.deleted_at IS NULL AS live
      FROM crm_agents a
      LEFT JOIN users u ON u.id = a.id AND u.tenant_id = a.tenant_id
     WHERE a.tenant_id = ${row.id}`;
  const off = a.filter((x: any) => x.duty_status === 'OFF_DUTY').length;
  const joined = a.filter((x: any) => x.live).length;
  console.log(`  ${row.id}: crm_agents=${a.length}  joined-to-users=${joined}  OFF_DUTY=${off}`);
}
process.exit(0);

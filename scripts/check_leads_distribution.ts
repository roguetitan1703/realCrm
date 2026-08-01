import { sql } from '../backend/src/services/db.js';

async function main() {
  const tenant = 'delpat';
  // Total leads for tenant
  const total = await sql<{ cnt: number }>`SELECT COUNT(*)::int AS cnt FROM crm_leads WHERE tenant_id = ${tenant}`;
  console.log('Total leads for tenant', tenant, total[0].cnt);

  // Leads per agent (agent_id may be null)
  const perUser = await sql`SELECT agent_id, COUNT(*)::int AS cnt FROM crm_leads WHERE tenant_id = ${tenant} GROUP BY agent_id`;
  console.log('Leads per agent_id:');
  perUser.forEach(row => console.log('  ', row.agent_id ?? 'NULL (Unassigned/Owner)', row.cnt));

  // List users and their roles
  const users = await sql`SELECT id, role, name FROM users WHERE tenant_id = ${tenant}`;
  console.log('Tenant users:');
  users.forEach(u => console.log('  ', u.id, u.role, u.name));
}

main().catch(err => console.error('Error', err));

import { sql } from '../backend/src/services/db.js';

async function main() {
  const tenant = 'delpat';
  const users = await sql`SELECT id, role, name, email FROM users WHERE tenant_id = ${tenant}`;
  console.log('Team members for tenant', tenant);
  users.forEach(u => {
    console.log(`- ${u.name} (${u.email}) – role: ${u.role} – id: ${u.id}`);
  });
}

main().catch(err => console.error('Error', err));

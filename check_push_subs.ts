import { sql } from './backend/src/services/db.ts';

async function main() {
  const subs = await sql`SELECT user_id, tenant_id, endpoint, created_at FROM push_subscriptions;`;
  console.log('Subscriptions:', subs);
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});

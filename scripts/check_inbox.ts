import { sql } from '../backend/src/services/db.js';

async function check() {
  const inbox = await sql`SELECT * FROM webhook_inbox WHERE tenant_id = 'delpat' ORDER BY received_at DESC LIMIT 5;`;
  console.log('=== WEBHOOK INBOX ===');
  console.log(JSON.stringify(inbox, null, 2));

  const rejects = await sql`SELECT * FROM ingest_rejects WHERE tenant_hint = 'delpat' OR presented_key LIKE '%sk_live%' ORDER BY created_at DESC LIMIT 5;`;
  console.log('=== INGEST REJECTS ===');
  console.log(JSON.stringify(rejects, null, 2));

  const leads = await sql`SELECT * FROM crm_leads WHERE tenant_id = 'delpat' ORDER BY created_at DESC LIMIT 5;`;
  console.log('=== CRM LEADS ===');
  console.log(JSON.stringify(leads, null, 2));

  await sql.end();
  process.exit(0);
}

check().catch(console.error);

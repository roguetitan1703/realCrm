/**
 * ============================================================================
 * THE TUTORIAL FIRM, RESET TO THE SAME STATE EVERY TIME
 * ============================================================================
 * WHEN TO RUN THIS: before recording a tutorial video (`tutorial-videos record`
 * runs it for you), or when the `tutorial` firm on development looks wrong.
 *
 *   npm run seed:tutorial
 *
 * A tutorial video shows a firm's desk to people outside Delpat, so nothing on
 * it may be a real person: every name here is invented and every phone number
 * sits in the 99555 block seed-dev uses for fiction. It is its own firm, not
 * `delpat`, because a recording needs a desk that starts identical on every
 * run: the teammate the video adds must not already exist from the last take.
 *
 * DELETES AND RECREATES ONE FIRM: every row whose tenant_id is `tutorial`, and
 * nothing else. Development only, with the same guard as seed-dev-login: it
 * refuses unless the database it resolves is not the one DATABASE_URL names.
 * The sign-in below is a known password, which is only a fixture there.
 * ============================================================================
 */
import postgres from 'postgres';
import { appEnv, databaseUrl, dbRef } from '../services/env.js';

process.env.APP_ENV = process.env.APP_ENV || 'development';

export const TUTORIAL = {
  tenant: 'tutorial',
  firmName: 'Harbourline Realty',
  city: 'Pune',
  ownerName: 'Neha Kulkarni',
  ownerEmail: 'neha@harbourline.example',
  password: 'Tutorial@2026',
};

if (appEnv() !== 'development') {
  console.error(`\n✗ APP_ENV is "${appEnv()}", not "development". Refusing.\n`);
  process.exit(1);
}
const url = databaseUrl();
if (!url) { console.error('✗ No database URL resolved.'); process.exit(1); }
if (process.env.DATABASE_URL && dbRef(url) === dbRef(process.env.DATABASE_URL)) {
  console.error(`\n✗ The development URL resolves to the same project as DATABASE_URL (${dbRef(url)}). Refusing.\n`);
  process.exit(1);
}

// The same numbers on every run, so two recordings of one tutorial match.
let seed = 20260927;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const TEAM = [
  { name: 'Rohan Desai', role: 'agent' },
  { name: 'Sana Iyer', role: 'agent' },
  { name: 'Kabir Menon', role: 'agent' },
];
const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Diya', 'Ananya', 'Ishaan', 'Meera', 'Tanvi', 'Yash', 'Nikhil', 'Pooja', 'Rahul', 'Sneha', 'Arjun'];
const LAST = ['Sharma', 'Patel', 'Reddy', 'Nair', 'Joshi', 'Gupta', 'Bhat', 'Rao', 'Shetty', 'Pillai'];
const LOCALITIES = ['Wakad', 'Baner', 'Hinjewadi', 'Kharadi', 'Aundh', 'Balewadi'];
const SOURCES = ['99acres', 'MagicBricks', 'Website', 'Walk-in', 'Referral'];
const STAGES = ['New', 'New', 'Interested', 'Callback', 'Follow-Up', 'Follow-Up', 'Site Visit', 'Call Not Received', 'Deal Closed', 'Rejected'];
const CONFIGS = ['1 BHK', '2 BHK', '2 BHK', '3 BHK'];

const sql = postgres(url, { max: 1, ssl: 'require' });

async function wipe() {
  const T = TUTORIAL.tenant;
  const tables: { table_name: string }[] = await sql`
    SELECT DISTINCT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenant_id' AND table_name NOT IN ('tenants', 'audit_log')`;
  // Foreign keys decide the order, and nothing here knows it: delete what can
  // be deleted, and go round again until a pass removes nothing.
  let left = tables.map(t => t.table_name);
  for (let pass = 0; left.length && pass < 8; pass++) {
    const failed: string[] = [];
    for (const t of left) {
      try { await sql`DELETE FROM ${sql(t)} WHERE tenant_id = ${T}`; }
      catch { failed.push(t); }
    }
    if (failed.length === left.length) throw new Error(`Could not clear: ${failed.join(', ')}`);
    left = failed;
  }
  // The firm's own audit chain goes whole, with its saved check: a check left
  // behind remembers a hash no row has any more and reports the new firm's
  // first entry as following a deleted one. Rows in the legacy chain (from
  // before per-firm chains) are left alone; this firm has none.
  await sql`DELETE FROM audit_log WHERE chain = ${T}`;
  await sql`DELETE FROM audit_checks WHERE chain = ${T}`;
  await sql`DELETE FROM tenants WHERE id = ${T}`;
}

async function main() {
  console.log(`→ development database ${dbRef(url)}`);
  await wipe();

  // Made the way the console makes a firm: one implementation of "a new firm".
  const { provisionTenant } = await import('../services/store.js');
  const made = await provisionTenant({
    firmName: TUTORIAL.firmName, city: TUTORIAL.city, slug: TUTORIAL.tenant,
    ownerName: TUTORIAL.ownerName, ownerEmail: TUTORIAL.ownerEmail,
    ownerPassword: TUTORIAL.password, mustChangePassword: false,
    primaryColor: '#B7791F',
    initialTeam: TEAM as any,
  });
  if (made.tenant.id !== TUTORIAL.tenant) throw new Error(`Made "${made.tenant.id}", expected "${TUTORIAL.tenant}".`);

  const agents: { id: string }[] = await sql`
    SELECT id FROM users WHERE tenant_id = ${TUTORIAL.tenant} AND role = 'agent' ORDER BY name`;
  // The agents sign in too, for the tutorials shot on an agent's phone: the
  // same known password, already changed, so no first-sign-in screen.
  const bcrypt = (await import('bcryptjs')).default;
  await sql`UPDATE users SET password_hash = ${await bcrypt.hash(TUTORIAL.password, 10)}, must_change_password = FALSE
            WHERE tenant_id = ${TUTORIAL.tenant} AND role = 'agent'`;
  // The rota is the agents, not the owner: the tutorial adds someone to it.
  await sql`UPDATE crm_routing_rules SET active_agent_ids = ${sql.json(agents.map(a => a.id))}
            WHERE tenant_id = ${TUTORIAL.tenant}`;

  const now = Date.now();
  const pool: (string | null)[] = [...agents.map(a => a.id), null];
  for (let i = 0; i < 48; i++) {
    const created = new Date(now - Math.floor(rnd() * 20) * 86400_000 - Math.floor(rnd() * 36000_000));
    const req = { locality: pick(LOCALITIES), config: pick(CONFIGS), budgetMin: (40 + Math.floor(rnd() * 30)) * 100000, budgetMax: (80 + Math.floor(rnd() * 80)) * 100000 };
    await sql`
      INSERT INTO crm_leads (id, tenant_id, name, phone, stage, source, locality, agent_id, req, created_at, updated_at)
      VALUES (${`l_tut_${i}`}, ${TUTORIAL.tenant}, ${`${pick(FIRST)} ${pick(LAST)}`}, ${`+9199555${String(700000 + i).slice(-6)}`},
              ${pick(STAGES)}, ${pick(SOURCES)}, ${req.locality}, ${pick(pool)}, ${sql.json(req)}, ${created}, ${created})`;
  }
  // THE LEADS A TUTORIAL NAMES. Random names can repeat, and a tutorial that
  // clicks "Arjun Nair" must mean one person. These two names cannot come out
  // of FIRST × LAST above.
  const rohan = (await sql`SELECT id FROM users WHERE tenant_id = ${TUTORIAL.tenant} AND login_id = 'rohan'`)[0]?.id;
  const fixed = [
    { id: 'l_tut_kavya', name: 'Kavya Menon', agent: null, locality: 'Aundh', config: '3 BHK', ago: 1 },      // unassigned
    { id: 'l_tut_riya', name: 'Riya Kapoor', agent: rohan, locality: 'Hinjewadi', config: '2 BHK', ago: 0 },  // Rohan's, not yet called
  ];
  for (const f of fixed) {
    const at = new Date(now - f.ago * 86400_000 - 3600_000);
    await sql`
      INSERT INTO crm_leads (id, tenant_id, name, phone, stage, source, locality, agent_id, req, created_at, updated_at)
      VALUES (${f.id}, ${TUTORIAL.tenant}, ${f.name}, ${`+9199555${String(799000 + fixed.indexOf(f)).slice(-6)}`}, 'New', 'Website', ${f.locality},
              ${f.agent}, ${sql.json({ locality: f.locality, config: f.config, budgetMin: 6000000, budgetMax: 9500000 })}, ${at}, ${at})`;
  }
  const [n] = await sql`SELECT count(*)::int n FROM crm_leads WHERE tenant_id = ${TUTORIAL.tenant}`;
  console.log(`✓ ${TUTORIAL.firmName} (/${TUTORIAL.tenant}): owner ${TUTORIAL.ownerEmail}, ${agents.length} agents, ${n.n} leads`);
}

main()
  .then(async () => { await sql.end(); process.exit(0); })
  .catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });

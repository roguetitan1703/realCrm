/**
 * Fill a DEVELOPMENT tenant with synthetic leads, so the filters, pills, sweeps and
 * dashboard can be exercised against realistic volume.
 *
 *   npm run dev:backend:development     (once, to build the schema + demo tenant)
 *   APP_ENV=development npm run seed:dev -- --tenant=skyline-realty --n=400
 *
 * WHY SYNTHETIC, NEVER A COPY OF PRODUCTION
 * -----------------------------------------
 * bhumi's leads are real people: names, mobile numbers, budgets, and remarks
 * about their families. Copying them into a second database doubles the number
 * of places a real firm's contact list lives, for the sake of test data that
 * does not need to be true. Everything below is generated.
 *
 * REFUSES TO RUN ANYWHERE BUT STAGING. Not by a flag someone passes — a seeder
 * is exactly the kind of script that gets run in the wrong shell at eleven at
 * night — but by requiring APP_ENV=development AND that the database it resolves to
 * is not the one DATABASE_URL names.
 */
import postgres from 'postgres';
import { dbRef, databaseUrl, appEnv } from '../services/env';

const arg = (k: string, d?: string) =>
  process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;

// NO HARDCODED REF. Staging is whatever DEV_DATABASE_URL names; what makes
// it safe is that it must be DECLARED and must not be the same database the
// production variable names.
const url = databaseUrl();
const ref = dbRef(url);
if (appEnv() !== 'development') {
  console.error(`
Refusing to seed: APP_ENV is "${appEnv()}". Run with APP_ENV=development.
`);
  process.exit(1);
}
if (!ref || ref === dbRef(process.env.DATABASE_URL)) {
  console.error(`
Refusing to seed: the development URL names the same database as DATABASE_URL (${ref || 'unknown'}).
`);
  process.exit(1);
}
const slug = arg('tenant', 'skyline-realty')!;
const count = Math.min(Number(arg('n', '200')), 2000);
const sql = postgres(url, { max: 1, ssl: 'require' });

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Diya', 'Ananya', 'Ishaan', 'Kabir', 'Meera', 'Rohan', 'Sana', 'Tanvi', 'Yash', 'Nikhil', 'Pooja', 'Rahul', 'Sneha'];
const LAST = ['Sharma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Desai', 'Kulkarni', 'Joshi', 'Menon', 'Gupta'];
const LOCALITIES = ['Wakad', 'Baner', 'Hinjewadi', 'Kharadi', 'Aundh', 'Balewadi', 'Pimple Saudagar'];
const SOURCES = ['Housing.com', '99acres', 'MagicBricks', 'Website', 'Walk-in', 'Referral'];
const STAGES = ['New', 'Interested', 'Call Not Received', 'Callback', 'Follow-Up', 'Site Visit', 'Rejected', 'Deal Closed'];
const CONFIGS = ['1 BHK', '2 BHK', '3 BHK', '4 BHK'];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rand = (n: number) => Math.floor(Math.random() * n);

async function main() {
  const [tenant] = await sql`SELECT id, name FROM tenants WHERE slug = ${slug} OR id = ${slug}`;
  if (!tenant) {
    console.error(`No tenant "${slug}" in development. Boot the backend against development once to create the demo tenant.`);
    process.exit(1);
  }
  const t = tenant.id;
  const agents = await sql`SELECT id FROM users WHERE tenant_id = ${t} AND role = 'agent' AND status ILIKE 'active'`;
  const agentIds: (string | null)[] = agents.map((a: any) => a.id);
  // Some leads land with nobody on them — that is a real state the Unassigned
  // filter and the unrouted alert both exist for, and a seed where every row is
  // assigned never exercises either.
  agentIds.push(null, null);

  console.log(`Seeding ${count} leads into ${tenant.name} (${t}) across ${agents.length} agents…`);
  let made = 0;
  for (let i = 0; i < count; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    // A phone number that cannot collide with a real one: the 5550xxx block is
    // reserved for fiction, and findLeadByPhone matches on the last ten digits.
    const phone = `+9199555${String(100000 + i).slice(-6)}`;
    const stage = pick(STAGES);
    const ageDays = rand(45);
    const created = new Date(Date.now() - ageDays * 86400_000 - rand(86400_000));
    const id = `l_stg_${Date.now()}_${i}`;
    const req = {
      locality: pick(LOCALITIES),
      config: pick(CONFIGS),
      budgetMin: (30 + rand(40)) * 100000,
      budgetMax: (80 + rand(120)) * 100000,
    };
    await sql`
      INSERT INTO crm_leads (id, tenant_id, name, phone, stage, source, locality, agent_id, req, created_at, updated_at)
      VALUES (${id}, ${t}, ${name}, ${phone}, ${stage}, ${pick(SOURCES)}, ${req.locality},
              ${pick(agentIds)}, ${sql.json(req)}, ${created}, ${created})
      ON CONFLICT (id) DO NOTHING`;
    made++;
  }
  const [n] = await sql`SELECT count(*)::int n FROM crm_leads WHERE tenant_id = ${t}`;
  console.log(`Done. ${made} inserted; ${tenant.name} now holds ${n.n} leads.`);
}

main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });

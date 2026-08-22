/**
 * Fill a STAGING tenant with synthetic leads, so the filters, pills, sweeps and
 * dashboard can be exercised against realistic volume.
 *
 *   npm run dev:backend:staging     (once, to build the schema + demo tenant)
 *   APP_ENV=staging npx tsx backend/src/scripts/seed-staging.ts --tenant=skyline-realty --n=400
 *
 * WHY SYNTHETIC, NEVER A COPY OF PRODUCTION
 * -----------------------------------------
 * bhumi's leads are real people: names, mobile numbers, budgets, and remarks
 * about their families. Copying them into a second database doubles the number
 * of places a real firm's contact list lives, for the sake of test data that
 * does not need to be true. Everything below is generated.
 *
 * REFUSES TO RUN ANYWHERE BUT STAGING. The check is the Supabase project ref in
 * the connection string, not a flag someone passes — a seeder is exactly the
 * kind of script that gets run in the wrong shell at eleven at night.
 */
import postgres from 'postgres';
import { dbRef, databaseUrl } from '../services/env';

const arg = (k: string, d?: string) =>
  process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;

const STAGING_REF = 'hziiyelgcfsgokdegicd';
const url = databaseUrl();
if (dbRef(url) !== STAGING_REF) {
  console.error(`\nRefusing to seed: DATABASE points at "${dbRef(url) || 'unknown'}", not the staging project.`);
  console.error(`Run with APP_ENV=staging and STAGING_DATABASE_URL set.\n`);
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
    console.error(`No tenant "${slug}" in staging. Boot the backend against staging once to create the demo tenant.`);
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

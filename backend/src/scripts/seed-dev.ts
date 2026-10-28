/**
 * Fill a DEVELOPMENT tenant with synthetic leads, so the filters, pills, sweeps and
 * dashboard can be exercised against realistic volume.
 *
 *   npm run start:api:dev            (once, to build the schema + demo tenant)
 *   npm run seed:dev -- --tenant=skyline-realty --n=400
 *
 * WHY SYNTHETIC, NEVER A COPY OF PRODUCTION
 * -----------------------------------------
 * bhumi's leads are real people: names, mobile numbers, budgets, and remarks
 * about their families. Copying them into a second database doubles the number
 * of places a real firm's contact list lives, for the sake of test data that
 * does not need to be true. Everything below is generated.
 *
 * REFUSES TO RUN ANYWHERE BUT DEVELOPMENT. Not by a flag someone passes — a seeder
 * is exactly the kind of script that gets run in the wrong shell at eleven at
 * night — but by requiring APP_ENV=development AND that the database it resolves to
 * is not the one DATABASE_URL names.
 */
import postgres from 'postgres';
import { dbRef, databaseUrl, appEnv } from '../services/env';
import { pgOptions } from '../services/pgOptions.js';
import { adoptSynthetic } from '../services/devData.js';

const arg = (k: string, d?: string) =>
  process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;

// A script named seed-dev declares its own environment rather than requiring
// the caller to remember a shell-specific prefix — `npm run seed:dev` has to be
// the whole command. The guard that matters is not this line, which the script
// sets itself; it is the one below, that the database resolved is NOT the one
// DATABASE_URL names.
process.env.APP_ENV = process.env.APP_ENV || 'development';

// NO HARDCODED REF. Development is whatever DEV_DATABASE_URL names; what makes
// it safe is that it must be DECLARED and must not be the same database the
// production variable names.
const url = databaseUrl();
const ref = dbRef(url);
if (appEnv() !== 'development') {
  console.error(`
Refusing to seed: APP_ENV is "${appEnv()}", not development.
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
const sql = postgres(url, pgOptions(url, { max: 1 }));

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Diya', 'Ananya', 'Ishaan', 'Kabir', 'Meera', 'Rohan', 'Sana', 'Tanvi', 'Yash', 'Nikhil', 'Pooja', 'Rahul', 'Sneha',
  'Aditi', 'Gaurav', 'Harsh', 'Isha', 'Jaya', 'Kunal', 'Lakshmi', 'Nitin', 'Omkar', 'Prachi', 'Riya', 'Siddhi', 'Tushar', 'Varun'];
const LAST = ['Sharma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Desai', 'Kulkarni', 'Joshi', 'Menon', 'Gupta',
  'Bhatt', 'Chopra', 'Dutta', 'Kapoor', 'Mishra', 'Pillai', 'Saxena', 'Trivedi'];
const LOCALITIES = ['Wakad', 'Baner', 'Hinjewadi', 'Kharadi', 'Aundh', 'Balewadi', 'Pimple Saudagar'];
const SOURCES = ['Housing.com', '99acres', 'MagicBricks', 'Website', 'Walk-in', 'Referral'];
const STAGES = ['New', 'Interested', 'Call Not Received', 'Callback', 'Follow-Up', 'Site Visit', 'Rejected', 'Deal Closed'];
const CONFIGS = ['1 BHK', '2 BHK', '3 BHK', '4 BHK'];

// SEEDED, so a second run draws the same leads, and their ids are numbered
// rather than stamped with the clock: run twice, the second run inserts
// nothing (ON CONFLICT DO NOTHING) instead of doubling the firm.
let seed = 20261028;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const rand = (n: number) => Math.floor(rnd() * n);
// ONE PERSON PER NAME. The smoke tests find people by name ("Aarav Gupta" must
// be one row; a colleague's lead must not be on an agent's screen, judged by
// its name), so a second "Sneha Menon" on another agent's desk reads as a leak.
// The names the other dev seeders write are taken too.
const RESERVED = new Set(['Aarav Gupta', 'Rohit Kale', 'Anand Rao', 'Neha Kulkarni', 'Rahul Deshpande', 'Sameer Joshi', 'Pooja Nair', 'Arjun Mehta']);
// Open stages have a next step booked; the mix gives Today something overdue,
// something due later today and something coming.
const OPEN = new Set(['Interested', 'Callback', 'Follow-Up', 'Site Visit']);
const ACTION: Record<string, string> = { Interested: 'Follow-up Call', Callback: 'Callback', 'Follow-Up': 'Follow-up Call', 'Site Visit': 'Site Visit' };

async function main() {
  const [tenant] = await sql`SELECT id, name FROM tenants WHERE slug = ${slug} OR id = ${slug}`;
  if (!tenant) {
    console.error(`No tenant "${slug}" in development. Boot the backend against development once to create the demo tenant.`);
    process.exit(1);
  }
  const t = tenant.id;
  await adoptSynthetic(sql, t, 'seed-dev');
  // A FRESH DATABASE HAS NO DESK. The auth seed creates the tenant and its
  // owner; the agents come from the bundled demo dataset, which a new project
  // never received. Without them every seeded lead lands unassigned, which
  // exercises exactly one filter and none of the routing.
  let agents = await sql`SELECT id FROM users WHERE tenant_id = ${t} AND role = 'agent' AND status ILIKE 'active'`;
  if (!agents.length) {
    const desk = [['Priya Raman', 'PR'], ['Arjun Shetty', 'AS'], ['Neha Kulkarni', 'NK'], ['Imran Sheikh', 'IS']];
    for (const [name, initials] of desk) {
      // TENANT IN THE KEY. This was `u_dev_${initials}`, which is global — so
      // seeding a SECOND tenant hit ON CONFLICT (id) DO NOTHING against the
      // first tenant's rows, created nobody, and still printed "Created 4".
      // Every lead then landed unassigned, which exercises one filter and no
      // routing at all.
      const id = `u_dev_${t}_${initials.toLowerCase()}`;
      const first = name.split(' ')[0];
      await sql`
        INSERT INTO users (id, tenant_id, name, email, role, status, metadata)
        VALUES (${id}, ${t}, ${name}, ${`${first.toLowerCase()}@example.invalid`}, 'agent', 'ACTIVE',
                ${sql.json({ initials })})
        ON CONFLICT (id) DO NOTHING`;
      await sql`
        INSERT INTO crm_agents (id, tenant_id, name, first, initials, avatar, role, duty_status)
        VALUES (${id}, ${t}, ${name}, ${first}, ${initials}, '#1E6F52', 'agent', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING`;
    }
    // example.invalid is reserved by RFC 2606 and can never route mail, so a
    // stray notification cannot reach a real person from test data.
    agents = await sql`SELECT id FROM users WHERE tenant_id = ${t} AND role = 'agent' AND status ILIKE 'active'`;
    // Report what the database HAS, not what the loop attempted — the old line
    // printed the intended count unconditionally and hid the bug above.
    console.log(`Created ${agents.length} development agents on ${t}.`);
  }
  const agentIds: (string | null)[] = agents.map((a: any) => a.id);
  // Some leads land with nobody on them — that is a real state the Unassigned
  // filter and the unrouted alert both exist for, and a seed where every row is
  // assigned never exercises either.
  agentIds.push(null, null);

  console.log(`Seeding ${count} leads into ${tenant.name} (${t}) across ${agents.length} agents…`);
  // Today in the firm's day (IST, as the other dev seeders draw it).
  const [clock] = await sql`SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata') AS d0, now() AS now`;
  const d0 = new Date(clock.d0).getTime(), now = new Date(clock.now).getTime();
  let made = 0, booked = 0;
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    // Distinct while there are names left to give (30 × 18); past that, repeats.
    let name = `${pick(FIRST)} ${pick(LAST)}`;
    for (let tries = 0; RESERVED.has(name) || (used.has(name) && tries < 500); tries++) name = `${pick(FIRST)} ${pick(LAST)}`;
    used.add(name);
    // A phone number that cannot collide with a real one: the 5550xxx block is
    // reserved for fiction, and findLeadByPhone matches on the last ten digits.
    const phone = `+9199555${String(100000 + i).slice(-6)}`;
    const stage = pick(STAGES);
    const ageDays = rand(45);
    const created = new Date(now - ageDays * 86400_000 - rand(86400_000));
    const id = `l_stg_${t}_${i}`;
    const req = {
      locality: pick(LOCALITIES),
      config: pick(CONFIGS),
      budgetMin: (30 + rand(40)) * 100000,
      budgetMax: (80 + rand(120)) * 100000,
    };
    const agent = pick(agentIds);
    // 0: overdue by one to three days; 1: today, later on; 2: in the next few days.
    let followUp: any = null;
    if (OPEN.has(stage) && agent) {
      const kind = i % 3;
      const hour = 10 + rand(9);
      let at = kind === 0 ? d0 - (1 + rand(3)) * 86400_000 + hour * 3600_000
        : kind === 1 ? Math.max(now + (1 + rand(4)) * 3600_000, d0 + hour * 3600_000)
        : d0 + (1 + rand(4)) * 86400_000 + hour * 3600_000;
      // Run late in the evening, "later today" would be tomorrow: keep it today.
      if (kind === 1 && at >= d0 + 86400_000) at = d0 + 86400_000 - 15 * 60_000;
      if (at < created.getTime()) at = created.getTime() + 3600_000;
      followUp = { action: ACTION[stage], at: new Date(at).toISOString() };
    }
    const r = await sql`
      INSERT INTO crm_leads (id, tenant_id, name, phone, stage, source, locality, agent_id, req, follow_up, created_at, updated_at)
      VALUES (${id}, ${t}, ${name}, ${phone}, ${stage}, ${pick(SOURCES)}, ${req.locality},
              ${agent}, ${sql.json(req)}, ${followUp ? sql.json(followUp) : null}, ${created}, ${created})
      ON CONFLICT (id) DO NOTHING`;
    made += r.count;
    if (r.count && followUp) booked++;
  }
  const [n] = await sql`SELECT count(*)::int n FROM crm_leads WHERE tenant_id = ${t}`;
  console.log(`Done. ${made} inserted (${booked} with a follow-up booked; ${count - made} already there); ${tenant.name} now holds ${n.n} leads.`);
}

main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });

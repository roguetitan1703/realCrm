/**
 * ============================================================================
 * A FEW DAYS OF AGENT WORK, FOR THE DEVELOPMENT DATABASE
 * ============================================================================
 * WHEN TO RUN THIS: to see My day / Team today with something in them on dev.
 *
 *   npm run seed:dev:activity            clear any earlier run, then write
 *   npm run seed:dev:activity -- --clear only clear
 *
 * Writes, on the `delpat` tenant only, what its agents would have done today
 * (up to now), yesterday and the day before: calls with and without an
 * outcome, WhatsApps, notes, status changes, follow-ups and callbacks, site
 * visits, calls on the calling list, and a handful of enquiries that came in
 * this morning — some called, some not. One agent is left idle today on
 * purpose, so the warnings have something true to say.
 *
 * Everything it writes is marked (`metadata.demo = 'activity'`, ids starting
 * `evt_demo_`, `act_demo_`, `l_demo_`), and every record it moves remembers
 * what it was (`demoPrev`), so --clear puts the fixtures back as they were.
 *
 * Refuses anything but the development database, the same guard as
 * seed-dev-login.ts.
 * ============================================================================
 */
import postgres from 'postgres';
import { appEnv, databaseUrl, dbRef } from '../services/env.js';

process.env.APP_ENV = process.env.APP_ENV || 'development';
const TENANT = 'delpat';
const clearOnly = process.argv.includes('--clear');

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
const sql = postgres(url, { max: 1, ssl: 'require' });

// ── Clear ───────────────────────────────────────────────────────────────────
async function clear() {
  // Put every moved record back to what it was before the first demo change.
  const leadPrev = await sql`
    SELECT DISTINCT ON (record_id) record_id, metadata->>'demoPrev' AS prev, metadata->'demoPrevFollowUp' AS fu, metadata ? 'demoPrevFollowUp' AS had_fu
      FROM crm_timeline_events
     WHERE tenant_id = ${TENANT} AND metadata->>'demo' = 'activity' AND metadata ? 'demoPrev' AND record_id LIKE 'l\\_%'
     ORDER BY record_id, timestamp ASC`;
  for (const r of leadPrev as any[]) await sql`UPDATE crm_leads SET stage = ${r.prev} WHERE id = ${r.record_id} AND tenant_id = ${TENANT}`;
  const fuPrev = await sql`
    SELECT DISTINCT ON (record_id) record_id, metadata->'demoPrevFollowUp' AS fu
      FROM crm_timeline_events
     WHERE tenant_id = ${TENANT} AND metadata->>'demo' = 'activity' AND metadata ? 'demoPrevFollowUp'
     ORDER BY record_id, timestamp ASC`;
  for (const r of fuPrev as any[]) {
    await sql`UPDATE crm_leads SET follow_up = ${r.fu && r.fu !== 'null' ? sql.json(r.fu) : null} WHERE id = ${r.record_id} AND tenant_id = ${TENANT}`;
  }
  const ownerPrev = await sql`
    SELECT DISTINCT ON (record_id) record_id, metadata->>'demoPrev' AS prev
      FROM crm_timeline_events
     WHERE tenant_id = ${TENANT} AND metadata->>'demo' = 'activity' AND metadata ? 'demoPrev' AND record_id NOT LIKE 'l\\_%'
     ORDER BY record_id, timestamp ASC`;
  for (const r of ownerPrev as any[]) await sql`UPDATE crm_owners SET stage = ${r.prev} WHERE id = ${r.record_id} AND tenant_id = ${TENANT}`;
  const cbPrev = await sql`
    SELECT DISTINCT ON (record_id) record_id, metadata->>'demoPrevCallback' AS cb
      FROM crm_timeline_events
     WHERE tenant_id = ${TENANT} AND metadata->>'demo' = 'activity' AND metadata ? 'demoPrevCallback'
     ORDER BY record_id, timestamp ASC`;
  for (const r of cbPrev as any[]) await sql`UPDATE crm_owners SET callback_at = ${r.cb || null} WHERE id = ${r.record_id} AND tenant_id = ${TENANT}`;

  const ev = await sql`DELETE FROM crm_timeline_events WHERE tenant_id = ${TENANT} AND (metadata->>'demo' = 'activity' OR record_id LIKE 'l\\_demo\\_%') RETURNING 1`;
  const act = await sql`DELETE FROM activities WHERE tenant_id = ${TENANT} AND id LIKE 'act\\_demo\\_%' RETURNING 1`;
  const leads = await sql`DELETE FROM crm_leads WHERE tenant_id = ${TENANT} AND id LIKE 'l\\_demo\\_%' RETURNING 1`;
  console.log(`  cleared: ${ev.length} events, ${act.length} visits, ${leads.length} demo leads; restored ${leadPrev.length} lead statuses, ${fuPrev.length} follow-ups, ${ownerPrev.length} owner statuses, ${cbPrev.length} callbacks`);
}

await clear();
if (clearOnly) { await sql.end(); process.exit(0); }

// ── Write ───────────────────────────────────────────────────────────────────
// Seeded, so two runs draw the same day.
let seed = 20260924;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;
let n = 0;
const eid = () => `evt_demo_${Date.now()}_${n++}`;
const DEMO = { demo: 'activity' };

// The firm's midnight, asked of the database — a JS Date built from a `date`
// column lands at the machine's midnight, not the firm's.
const [clock] = await sql`SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata') AS d0, now() AS now`;
const now = new Date(clock.now);
const istMidnight = (daysAgo: number) => new Date(new Date(clock.d0).getTime() - daysAgo * 86400000);
/** A random moment in the working day `daysAgo`, never in the future. */
function at(daysAgo: number, fromH = 9.75, toH = 19) {
  const d0 = istMidnight(daysAgo).getTime();
  const lo = d0 + fromH * 3600000;
  const hi = Math.min(d0 + toH * 3600000, now.getTime() - 5 * 60000);
  if (hi <= lo) return null;
  return new Date(lo + rnd() * (hi - lo));
}

const users = await sql`SELECT id, name, role FROM users WHERE tenant_id = ${TENANT} AND deleted_at IS NULL`;
const byName = (s: string) => (users as any[]).find(u => u.name.startsWith(s));

// How each person works. Rupali is idle today on purpose; Aniket rarely writes
// an outcome down, which is what the "no outcome written" number is for.
const PROFILES: Record<string, { calls: number; wa: number; notes: number; status: number; fu: number; visits: number; ownerCalls: number; ownerStatus: number; callbacks: number; log: number; idleToday?: boolean }> = {
  Kavish: { calls: 26, wa: 9, notes: 6, status: 7, fu: 4, visits: 1, ownerCalls: 18, ownerStatus: 5, callbacks: 3, log: 0.8 },
  Mohit: { calls: 17, wa: 11, notes: 4, status: 5, fu: 3, visits: 1, ownerCalls: 12, ownerStatus: 3, callbacks: 2, log: 0.6 },
  Aniket: { calls: 21, wa: 5, notes: 2, status: 4, fu: 2, visits: 0, ownerCalls: 22, ownerStatus: 2, callbacks: 1, log: 0.25 },
  Rupali: { calls: 14, wa: 6, notes: 3, status: 3, fu: 2, visits: 1, ownerCalls: 9, ownerStatus: 2, callbacks: 2, log: 0.7, idleToday: true },
  Siddharth: { calls: 5, wa: 2, notes: 2, status: 2, fu: 1, visits: 0, ownerCalls: 0, ownerStatus: 0, callbacks: 0, log: 0.9 },
};

const CALL_OUT: [string, string, number][] = [
  ['discussed', 'Wants 2BHK near Baner, budget 85L', 3], ['visit', 'Coming Saturday for a visit', 1.5],
  ['callback', 'Call after 6 pm', 1.5], ['details_sent', 'Sent project details on WhatsApp', 2],
  ['not_interested', 'Not looking any more', 1.5], ['booked_elsewhere', 'Booked with another broker', 0.5],
  ['no_answer', 'Call not received', 5], ['unreachable', 'Switched off', 2], ['wrong_number', 'Wrong number', 0.4],
];
const weighted = () => {
  const total = CALL_OUT.reduce((s, x) => s + x[2], 0);
  let r = rnd() * total;
  for (const x of CALL_OUT) { if ((r -= x[2]) <= 0) return x; }
  return CALL_OUT[0];
};
const NOTES = ['Looking in Baner or Balewadi only', 'Wife to decide, call back Sunday', 'Budget stretched to 1.1 Cr',
  'Needs ready possession', 'Prefers higher floor, east facing', 'Asked for rental comparables', 'Loan pre-approved'];
const LEAD_TO = ['Interested', 'Follow-Up', 'Site Visit', 'Callback', 'Call Not Received', 'Rejected'];
const OWNER_TO = ['Contacted', 'Interested', 'Key Received', 'Not Interested', 'Do Not Call'];

const events: any[] = [];
const ev = (e: any) => events.push({ id: eid(), tenant_id: TENANT, title: e.title, description: e.description ?? e.title,
  type: e.type, record_id: e.record_id, author: e.author, timestamp: e.at.toISOString(), metadata: sql.json({ ...DEMO, ...(e.meta || {}) }) });
const leadStage = new Map<string, string>();
const ownerStage = new Map<string, string>();

for (const [key, p] of Object.entries(PROFILES)) {
  const u = byName(key);
  if (!u) { console.log(`  (no ${key} on this desk — skipped)`); continue; }
  const leads = await sql`SELECT id, stage, follow_up FROM crm_leads WHERE tenant_id = ${TENANT} AND agent_id = ${u.id}
                            AND coalesce(stage, '') NOT IN ('Rejected', 'Deal Closed') ORDER BY id`;
  const owners = await sql`SELECT id, stage, callback_at FROM crm_owners WHERE tenant_id = ${TENANT} AND agent_id = ${u.id}
                             AND coalesce(stage, 'New') NOT IN ('Not Interested', 'Do Not Call') ORDER BY id`;
  if (!leads.length) continue;
  for (const daysAgo of [2, 1, 0]) {
    if (daysAgo === 0 && p.idleToday) continue;
    // Today is partial: scale by how much of the working day has gone.
    const share = daysAgo === 0 ? 0.85 : (daysAgo === 1 ? 1 : 0.7);
    const count = (x: number) => Math.round(x * share * (0.8 + rnd() * 0.4));

    // Calls, a few people rung twice.
    const rung: any[] = [];
    for (let i = 0; i < count(p.calls); i++) {
      const l = rung.length && chance(0.2) ? pick(rung) : pick(leads as any[]);
      rung.push(l);
      const t = at(daysAgo); if (!t) continue;
      const logged = chance(p.log);
      const o = weighted();
      ev({ type: 'call', title: 'Call', description: logged ? o[1] : 'Call initiated', record_id: l.id, author: u.id, at: t,
        meta: logged ? { outcome: o[0], edited: true } : {} });
    }
    for (let i = 0; i < count(p.wa); i++) {
      const t = at(daysAgo); if (!t) continue;
      ev({ type: 'whatsapp', title: 'WhatsApp', description: 'WhatsApp initiated', record_id: pick(rung.length ? rung : leads as any[]).id, author: u.id, at: t });
    }
    for (let i = 0; i < count(p.notes); i++) {
      const t = at(daysAgo); if (!t) continue;
      ev({ type: 'remark', title: 'Remark', description: pick(NOTES), record_id: pick(leads as any[]).id, author: u.id, at: t });
    }
    for (let i = 0; i < count(p.status); i++) {
      const l: any = pick(leads as any[]); const t = at(daysAgo); if (!t) continue;
      const from = leadStage.get(l.id) ?? l.stage ?? 'New';
      const to = pick(LEAD_TO.filter(s => s !== from));
      const reason = to === 'Rejected' ? pick(['Budget Mismatch', 'Locality Mismatch', 'Already purchased / rented']) : '';
      const line = `${from} → ${to}${reason ? ` — ${reason}` : ''}`;
      ev({ type: 'stage_change', title: line, description: line, record_id: l.id, author: u.id, at: t,
        meta: { from, to, ...(leadStage.has(l.id) ? {} : { demoPrev: l.stage }) } });
      leadStage.set(l.id, to);
    }
    for (let i = 0; i < count(p.fu); i++) {
      const l: any = pick(leads as any[]); const t = at(daysAgo); if (!t) continue;
      ev({ type: 'follow_up', title: chance(0.5) ? 'Completed' : 'Scheduled', description: pick(['Follow-up Call', 'Site Visit', 'Client Meeting']), record_id: l.id, author: u.id, at: t });
    }
    for (let i = 0; i < count(p.visits); i++) {
      const l: any = pick(leads as any[]); const t = at(daysAgo, 11, 18); if (!t) continue;
      await sql`INSERT INTO activities (id, tenant_id, lead_id, type, at, agent_id, remark, outcome, metadata)
                VALUES (${`act_demo_${Date.now()}_${n++}`}, ${TENANT}, ${l.id}, 'site_visit', ${t}, ${u.id}, 'Showed the 2BHK on the 7th floor', 'interested', ${sql.json(DEMO)})`;
    }
    // The calling list.
    for (let i = 0; i < count(p.ownerCalls) && owners.length; i++) {
      const o: any = pick(owners as any[]); const t = at(daysAgo); if (!t) continue;
      const logged = chance(p.log); const out = weighted();
      ev({ type: 'call', title: 'Call', description: logged ? out[1] : 'Call initiated', record_id: o.id, author: u.id, at: t,
        meta: logged ? { outcome: out[0], edited: true } : {} });
    }
    for (let i = 0; i < count(p.ownerStatus) && owners.length; i++) {
      const o: any = pick(owners as any[]); const t = at(daysAgo); if (!t) continue;
      const from = ownerStage.get(o.id) ?? o.stage ?? 'New';
      const to = pick(OWNER_TO.filter(s => s !== from));
      ev({ type: 'stage_change', title: `Stage → ${to}`, description: `Marked ${to}`, record_id: o.id, author: u.id, at: t,
        meta: { from, to, ...(ownerStage.has(o.id) ? {} : { demoPrev: o.stage ?? 'New' }) } });
      ownerStage.set(o.id, to);
    }
    for (let i = 0; i < count(p.callbacks) && owners.length; i++) {
      const o: any = pick(owners as any[]); const t = at(daysAgo); if (!t) continue;
      ev({ type: 'follow_up', title: 'Callback scheduled', description: 'Call back tomorrow evening', record_id: o.id, author: u.id, at: t,
        meta: { demoPrevCallback: o.callback_at ? new Date(o.callback_at).toISOString() : null } });
      // One due tomorrow, the rest already late: both are things the day shows.
      const when = i === 0 ? new Date(istMidnight(-1).getTime() + 18 * 3600000) : new Date(now.getTime() - (2 + i) * 3600000);
      await sql`UPDATE crm_owners SET callback_at = ${when} WHERE id = ${o.id} AND tenant_id = ${TENANT}`;
    }
  }
  // A follow-up due tomorrow for two of their leads.
  for (const l of (leads as any[]).slice(0, 2)) {
    const tomorrow = new Date(istMidnight(-1).getTime() + 11 * 3600000);
    ev({ type: 'follow_up', title: 'Scheduled', description: 'Follow-up Call', record_id: l.id, author: u.id, at: at(1) || new Date(),
      meta: { demoPrevFollowUp: l.follow_up ?? null } });
    await sql`UPDATE crm_leads SET follow_up = ${sql.json({ action: 'Follow-up Call', at: tomorrow.toISOString(), date: 'Tomorrow', time: '11:00 am' })}
              WHERE id = ${l.id} AND tenant_id = ${TENANT}`;
  }
}

// Where each moved record ended up.
for (const [id, stage] of leadStage) await sql`UPDATE crm_leads SET stage = ${stage} WHERE id = ${id} AND tenant_id = ${TENANT}`;
for (const [id, stage] of ownerStage) await sql`UPDATE crm_owners SET stage = ${stage} WHERE id = ${id} AND tenant_id = ${TENANT}`;

// Enquiries that came in this morning — some called, two not yet.
const NEW_LEADS = [['Neha Kulkarni', 'Kavish'], ['Rahul Deshpande', 'Kavish'], ['Sameer Joshi', 'Mohit'], ['Pooja Nair', 'Aniket'], ['Arjun Mehta', 'Rupali']];
for (const [i, [name, who]] of NEW_LEADS.entries()) {
  const u = byName(who); if (!u) continue;
  const came = at(0, 9, 13); if (!came) continue;
  const id = `l_demo_${Date.now()}_${i}`;
  await sql`INSERT INTO crm_leads (id, tenant_id, name, phone, stage, source, agent_id, req, created_at)
            VALUES (${id}, ${TENANT}, ${name}, ${'+9198900' + String(10000 + i)}, 'New', 'Portal One', ${u.id}, ${sql.json({})}, ${came})`;
  // Rupali is idle today, and Aniket has not got to his yet.
  if (who !== 'Rupali' && who !== 'Aniket') {
    ev({ type: 'call', title: 'Call', description: 'Wants 3BHK, will visit Sunday', record_id: id, author: u.id,
      at: new Date(Math.min(came.getTime() + 40 * 60000, now.getTime() - 60000)), meta: { outcome: 'discussed', edited: true } });
  }
}

for (let i = 0; i < events.length; i += 400) {
  await sql`INSERT INTO crm_timeline_events ${sql(events.slice(i, i + 400), 'id', 'tenant_id', 'record_id', 'type', 'title', 'description', 'author', 'timestamp', 'metadata')}`;
}
console.log(`  wrote ${events.length} events over 3 days, ${leadStage.size} leads and ${ownerStage.size} owners moved, ${NEW_LEADS.length} enquiries this morning — tenant ${TENANT}, db ${dbRef(url)}`);
await sql.end();

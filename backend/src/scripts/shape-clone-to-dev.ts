/**
 * ============================================================================
 * A BHUMI-SHAPED DESK IN DEVELOPMENT, WITH NO BHUMI IN IT
 * ============================================================================
 * WHEN TO RUN THIS: when a change touches what the desk COUNTS or how a lead's
 * history reads, and the development database's synthetic rows are too thin to
 * show it. Replaces `delpat`'s leads in DEVELOPMENT with a copy of the live
 * desk's SHAPE.
 *
 *   npx tsx backend/src/scripts/shape-clone-to-dev.ts            # dry run
 *   npx tsx backend/src/scripts/shape-clone-to-dev.ts --write
 *
 * WHY A SHAPE AND NOT A COPY. The counts read `type`, `author` and `timestamp`
 * and never once read the words, so the words are the only part that has to be
 * thrown away — and the words are the only part that is a real person. What
 * arrives in development is the stage distribution, the timeline structure, the
 * enquiry sessions and the follow-up clock, under generated names and numbers.
 * Every segment count comes out identical; nobody's remark or phone number
 * leaves production.
 *
 * READS production. WRITES development. It refuses to run if the two URLs name
 * the same Supabase project, and it refuses to write anywhere but `delpat`.
 * ============================================================================
 */
import postgres from 'postgres';
import { createHash } from 'crypto';
import { databaseUrl, dbRef } from '../services/env.js';

const WRITE = process.argv.includes('--write');
const FROM_TENANT = 'bhumi';
const TO_TENANT = 'delpat';

const PROD = process.env.DATABASE_URL || '';
const DEV = process.env.DEV_DATABASE_URL || '';
if (!PROD || !DEV) { console.error('Both DATABASE_URL and DEV_DATABASE_URL must be set.'); process.exit(1); }
if (dbRef(PROD) === dbRef(DEV)) {
  console.error(`\nRefusing: both URLs name the same project (${dbRef(PROD)}).\n`); process.exit(1);
}
void databaseUrl;

// ── the generated surface ───────────────────────────────────────────────────
// Deterministic from the source id, so re-running produces the same desk and a
// screenshot from yesterday still matches. Nothing here is derived from the
// real value it replaces — that would be a reversible cipher, not anonymity.
const FIRST = ['Aarav','Vivaan','Aditya','Diya','Ananya','Ishaan','Kabir','Meera','Rohan','Sana','Tanvi','Yash','Nikhil','Pooja','Rahul','Sneha','Kiran','Manish','Deepa','Farhan'];
const LAST = ['Sharma','Patel','Reddy','Nair','Iyer','Desai','Kulkarni','Joshi','Menon','Gupta','Rane','Bhosale','Chavan','Shetty'];
const REMARKS = [
  'Not reachable, will try again tomorrow',
  'Asked to call back after 6pm',
  'Wants to see the site over the weekend',
  'Budget is tighter than the enquiry said',
  'Looking only in this locality, nothing else',
  'Already spoken to another broker, still deciding',
  'Sent the brochure on WhatsApp',
  'Number switched off, messaged instead',
];
const seed = (id: string) => parseInt(createHash('sha1').update(id).digest('hex').slice(0, 10), 16);
// Math.abs, because `>>` coerces to a 32-bit SIGNED int and a hash seed this
// wide goes negative — which indexed off the front of the array and rendered
// "Pooja undefined" on the desk.
const pick = <T,>(arr: T[], n: number) => arr[Math.abs(n) % arr.length];

function surfaceFor(id: string, i: number) {
  const s = seed(id);
  const name = `${pick(FIRST, s)} ${pick(LAST, s >> 7)}`;
  // Unique and stable, and a real 10-digit shape so findLeadByPhone's
  // last-ten-digits rule behaves exactly as it does on the live desk.
  const phone = `+9199${String(10000000 + (i * 7919) % 89999999).slice(0, 8)}`;
  const email = `${name.toLowerCase().replace(/\s+/g, '.')}${i}@example.invalid`;
  return { name, phone, email };
}

// ── read production ─────────────────────────────────────────────────────────
const prod = postgres(PROD, { max: 1, ssl: 'require' });
console.log(`\nreading  ${dbRef(PROD)} · tenant ${FROM_TENANT}`);

const srcLeads = await prod`SELECT * FROM crm_leads WHERE tenant_id = ${FROM_TENANT} ORDER BY created_at`;
const ids = srcLeads.map((l: any) => l.id);
const srcEvents = ids.length
  ? await prod`SELECT * FROM crm_timeline_events WHERE tenant_id = ${FROM_TENANT} AND record_id = ANY(${ids}) ORDER BY timestamp`
  : [];
const srcEnq = ids.length
  ? await prod`SELECT * FROM crm_lead_enquiries WHERE tenant_id = ${FROM_TENANT} AND lead_id = ANY(${ids})`
  : [];
await prod.end();

console.log(`         ${srcLeads.length} leads · ${srcEvents.length} timeline events · ${srcEnq.length} enquiry sessions`);

// ── map the desk onto development's agents ──────────────────────────────────
const dev = postgres(DEV, { max: 1, ssl: 'require' });
const devAgents = await dev`
  SELECT id FROM users WHERE tenant_id = ${TO_TENANT} AND role = 'agent' AND deleted_at IS NULL ORDER BY id`;
if (!devAgents.length) { console.error(`\nNo agents on ${TO_TENANT} in development. Run seed:dev first.\n`); await dev.end(); process.exit(1); }

// Busiest source agent onto the first development agent, and so on down, so the
// per-agent facet counts in the Leads filters are worth looking at instead of
// being flat. An unassigned lead stays unassigned — that is a real state.
const load = new Map<string, number>();
for (const l of srcLeads as any[]) if (l.agent_id) load.set(l.agent_id, (load.get(l.agent_id) || 0) + 1);
const ranked = [...load.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
const agentMap = new Map<string, string>();
ranked.forEach((src, i) => agentMap.set(src, devAgents[i % devAgents.length].id));
const mapAgent = (a: string | null) => (a ? agentMap.get(a) || devAgents[seed(a) % devAgents.length].id : null);
// 'System' is load-bearing: the contact rule counts only person-authored rows,
// so an author that arrives as System has to leave as System.
const mapAuthor = (a: string | null) => (!a || a === 'System' ? a : mapAgent(a) || 'System');

console.log(`         ${ranked.length} source agents → ${devAgents.length} development agents`);

// ── rebuild ─────────────────────────────────────────────────────────────────
const leadId = new Map<string, string>();
srcLeads.forEach((l: any, i: number) => leadId.set(l.id, `l_shape_${String(i).padStart(4, '0')}`));

const DNC = /do\s*not\s*call|don'?t\s*call|not\s*interested|dnd|do\s*not\s*disturb/i;
const scrub = (v: any): any => {
  if (typeof v === 'string') {
    return v.replace(/\+?\d[\d\s-]{8,}\d/g, '99XXXXXXXX')
            .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, 'someone@example.invalid');
  }
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)]));
  return v;
};

const outLeads = srcLeads.map((l: any, i: number) => {
  const s = surfaceFor(l.id, i);
  return {
    id: leadId.get(l.id)!, tenant_id: TO_TENANT,
    name: s.name, phone: s.phone, email: s.email,
    // Everything below is the SHAPE and is copied exactly — it is what the
    // segments, the filters and the follow-up clock actually read.
    stage: l.stage, source: l.source, deal: l.deal, purpose: l.purpose,
    locality: l.locality, requirement: l.requirement, timeline_pref: l.timeline_pref,
    budget_min: l.budget_min, budget_max: l.budget_max,
    req: scrub(l.req || {}), follow_up: l.follow_up, overdue: l.overdue,
    created_at: l.created_at, updated_at: l.updated_at,
    agent_id: mapAgent(l.agent_id), created_by: mapAgent(l.created_by),
    // Only whether it reads as do-not-contact survives — that is the bit E
    // used to branch on, and the wording is somebody's sentence about a person.
    rejection_reason: l.rejection_reason ? (DNC.test(String(l.rejection_reason)) ? 'Do not call' : 'No Requirement') : null,
    import_batch_id: 'shape_clone',
  };
});

const outEvents = srcEvents.map((e: any, i: number) => {
  const person = e.author && e.author !== 'System';
  return {
    id: `evt_shape_${String(i).padStart(5, '0')}`,
    record_id: leadId.get(e.record_id)!, tenant_id: TO_TENANT,
    type: e.type, timestamp: e.timestamp, author: mapAuthor(e.author),
    // System rows are machine-written and carry no one's words, so they come
    // across whole — "Enquired again via 99acres: 2Bed in Green Cove" is listing
    // text. A row a PERSON typed is replaced outright.
    title: e.title,
    description: person ? pick(REMARKS, seed(e.id)) : scrub(e.description),
    metadata: {},
  };
});

const outEnq = srcEnq.map((q: any, i: number) => ({
  id: `enq_shape_${String(i).padStart(5, '0')}`, tenant_id: TO_TENANT,
  lead_id: leadId.get(q.lead_id)!, integration_id: null,
  session_key: `${leadId.get(q.lead_id)}_${i}`,
  first_at: q.first_at, last_at: q.last_at, payload_count: q.payload_count,
  source: q.source, req: scrub(q.req || {}), enquiry_ids: [], raw_refs: [],
}));

const byStage = outLeads.reduce((m: Record<string, number>, l) => {
  m[l.stage || '—'] = (m[l.stage || '—'] || 0) + 1; return m;
}, {});
console.log(`\nwould write to ${dbRef(DEV)} · tenant ${TO_TENANT}`);
console.log(`  ${outLeads.length} leads · ${outEvents.length} events · ${outEnq.length} enquiry sessions`);
console.log(`  stages: ${Object.entries(byStage).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`  person-written descriptions replaced: ${outEvents.filter(e => e.description && srcEvents.find((s: any) => s.author && s.author !== 'System')).length > 0 ? srcEvents.filter((e: any) => e.author && e.author !== 'System').length : 0}`);

if (!WRITE) {
  console.log('\nDry run. Nothing written. Re-run with --write.\n');
  await dev.end();
  process.exit(0);
}

// REPLACE. Read what is there first and say so — a delete that cannot say what
// it removed is how a probe overwrote a real stage and had to be recovered from
// the record's own timeline.
const had = await dev`SELECT count(*)::int AS n FROM crm_leads WHERE tenant_id = ${TO_TENANT}`;
console.log(`\nreplacing ${had[0].n} existing ${TO_TENANT} leads in development…`);
await dev`DELETE FROM crm_lead_enquiries WHERE tenant_id = ${TO_TENANT}`;
await dev`DELETE FROM crm_timeline_events WHERE tenant_id = ${TO_TENANT}`;
await dev`DELETE FROM lead_shortlist WHERE tenant_id = ${TO_TENANT}`;
await dev`DELETE FROM crm_leads WHERE tenant_id = ${TO_TENANT}`;

for (let i = 0; i < outLeads.length; i += 100) await dev`INSERT INTO crm_leads ${dev(outLeads.slice(i, i + 100) as any)}`;
for (let i = 0; i < outEvents.length; i += 200) await dev`INSERT INTO crm_timeline_events ${dev(outEvents.slice(i, i + 200) as any)}`;
for (let i = 0; i < outEnq.length; i += 200) await dev`INSERT INTO crm_lead_enquiries ${dev(outEnq.slice(i, i + 200) as any)}`;

const [after] = await dev`SELECT count(*)::int AS n FROM crm_leads WHERE tenant_id = ${TO_TENANT}`;
const [ev] = await dev`SELECT count(*)::int AS n FROM crm_timeline_events WHERE tenant_id = ${TO_TENANT}`;
console.log(`done. ${TO_TENANT} in development: ${after.n} leads, ${ev.n} timeline events.\n`);
await dev.end();

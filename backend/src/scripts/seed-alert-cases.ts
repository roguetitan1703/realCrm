/**
 * ============================================================================
 * ALERT TEST CASES ON THE DEVELOPMENT DESK
 * ============================================================================
 * WHEN TO RUN THIS: before checking the alert lifecycle by hand
 * (docs/specs/notifications.md), and again whenever you want fresh cases —
 * "due now" is only due for so long.
 *
 *   npx tsx backend/src/scripts/seed-alert-cases.ts \
 *       --api=http://localhost:5001 --owner=<id>:<password> --agent=<id>:<password>
 *   ... --clear      remove the cases and their alerts only
 *   ... --release    send the agent's held (morning) alerts now, as one summary
 *
 * Everything goes through the API as the owner, so every alert is raised by
 * the real code path, not written by this script. Cases are leads and owners
 * named `TEST n · …` on `delpat`; --clear removes them, their alerts, their
 * deliveries and their timeline rows, by those names and nothing else.
 *
 * Refuses anything but the development database and a non-production API.
 * ============================================================================
 */
import postgres from 'postgres';
import { appEnv, databaseUrl, dbRef } from '../services/env.js';

process.env.APP_ENV = process.env.APP_ENV || 'development';
const TENANT = 'delpat';
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const has = (k: string) => process.argv.includes(`--${k}`);

if (appEnv() !== 'development') { console.error(`✗ APP_ENV is "${appEnv()}", not "development". Refusing.`); process.exit(1); }
const url = databaseUrl();
if (process.env.DATABASE_URL && dbRef(url) === dbRef(process.env.DATABASE_URL)) { console.error('✗ Development resolves to production. Refusing.'); process.exit(1); }
const API = (arg('api') || 'http://localhost:5001').replace(/\/+$/, '') + '/api/v1';
if (/api\.re\.delpat\.in/.test(API)) { console.error('✗ That is the production API. Refusing.'); process.exit(1); }

const db = postgres(url, { max: 1, ssl: 'require', onnotice: () => {} });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function clear() {
  const leads = (await db`SELECT id FROM crm_leads WHERE tenant_id = ${TENANT} AND name LIKE 'TEST %'`).map((r: any) => r.id);
  const owners = (await db`SELECT id FROM crm_owners WHERE tenant_id = ${TENANT} AND name LIKE 'TEST %'`).map((r: any) => r.id);
  const ids = [...leads, ...owners];
  if (!ids.length) { console.log('Nothing to clear.'); return; }
  const n = (await db`SELECT id FROM notifications WHERE tenant_id = ${TENANT} AND record_ids && ${ids}`).map((r: any) => r.id);
  const d1 = await db`DELETE FROM push_deliveries WHERE tenant_id = ${TENANT} AND (notification_id = ANY(${n}) OR notification_ids && ${n})`;
  const d2 = await db`DELETE FROM notifications WHERE id = ANY(${n})`;
  const d3 = await db`DELETE FROM crm_timeline_events WHERE tenant_id = ${TENANT} AND record_id = ANY(${ids})`;
  await db`DELETE FROM activities WHERE tenant_id = ${TENANT} AND lead_id = ANY(${leads})`.catch(() => {});
  await db`DELETE FROM crm_lead_enquiries WHERE tenant_id = ${TENANT} AND lead_id = ANY(${leads})`.catch(() => {});
  const d4 = await db`DELETE FROM crm_leads WHERE tenant_id = ${TENANT} AND id = ANY(${leads})`;
  const d5 = await db`DELETE FROM crm_owners WHERE tenant_id = ${TENANT} AND id = ANY(${owners})`;
  console.log(`Cleared: ${d4.count} leads, ${d5.count} owners, ${d2.count} alerts, ${d1.count} deliveries, ${d3.count} timeline rows.`);
}

async function login(pair: string | undefined, role: string) {
  const [handle, password] = String(pair || '').split(':');
  if (!handle || !password) { console.error(`✗ Pass --${role}=<id>:<password>.`); process.exit(1); }
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': TENANT }, body: JSON.stringify({ handle, password }) });
  const j: any = await r.json();
  if (!j.token) { console.error(`✗ ${role} could not sign in: ${JSON.stringify(j)}`); process.exit(1); }
  return { token: j.token as string, id: j.user.id as string, name: j.user.name as string };
}
const call = async (tok: string, method: string, path: string, body?: any) => {
  const r = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, 'X-Tenant-ID': TENANT }, body: body ? JSON.stringify(body) : undefined });
  const j: any = await r.json().catch(() => ({}));
  if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j)}`);
  return j;
};

/** A slot in the firm's day, as the booking form writes it. */
function slot(daysAhead: number, hh: number, mm = 0) {
  const ist = new Date(Date.now() + 330 * 60_000);
  ist.setUTCDate(ist.getUTCDate() + daysAhead);
  ist.setUTCHours(hh, mm, 0, 0);
  const at = new Date(ist.getTime() - 330 * 60_000).toISOString();
  return { at, date: ist.toISOString().slice(0, 10), time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}

async function main() {
  if (has('release')) {
    const agent = await login(arg('agent'), 'agent');
    const r = await db`UPDATE notifications SET send_after = NOW() - interval '1 minute'
      WHERE tenant_id = ${TENANT} AND user_id = ${agent.id} AND pushed_at IS NULL AND closed_at IS NULL AND send_after > NOW()
      RETURNING id`;
    console.log(`${r.length} held alert(s) for ${agent.name} released; the sweep sends them as one summary within a minute.`);
    return;
  }
  await clear();
  if (has('clear')) return;

  const owner = await login(arg('owner'), 'owner');
  const agent = await login(arg('agent'), 'agent');
  const phone = (n: number) => `+9190000${String(10000 + n).slice(-5)}`;
  const lead = async (n: number, name: string, extra: any = {}) =>
    (await call(owner.token, 'POST', '/leads', { name: `TEST ${n} · ${name}`, phone: phone(n * 10 + (extra.k || 0)), source: 'Test', agentId: agent.id, ...extra.body })).data.id as string;

  const made: string[] = [];
  // 1. A new lead for the agent: `now`, pushed at once (or held, at night).
  made.push(`1  ${await lead(1, 'Call me')}`);
  // 2. Another, for reassigning away.
  made.push(`2  ${await lead(2, 'Move me')}`);
  // 3. Three leads handed over in one go: one `morning` alert naming all three.
  const batch: string[] = [];
  for (const [k, x] of [[1, 'A'], [2, 'B'], [3, 'C']] as const) {
    batch.push((await call(owner.token, 'POST', '/leads', { name: `TEST 3 · Batch ${x}`, phone: phone(30 + k), source: 'Test' })).data.id);
  }
  await call(owner.token, 'POST', '/leads/bulk-assign', { ids: batch, agentId: agent.id });
  made.push(`3  ${batch.join(', ')}`);
  // 4. A site visit the owner books for the agent, tomorrow 11:00: a task alert.
  const l4 = await lead(4, 'Visit booked');
  await call(owner.token, 'PATCH', `/modules/leads/records/${l4}`, { followUp: { action: 'Site visit', ...slot(1, 11), note: 'Test booking' } });
  made.push(`4  ${l4}`);
  // 5. A follow-up call due two minutes ago: the sweep raises "due now".
  const l5 = await lead(5, 'Due now');
  const due = new Date(Date.now() - 2 * 60_000);
  const dueIst = new Date(due.getTime() + 330 * 60_000);
  await call(owner.token, 'PATCH', `/modules/leads/records/${l5}`, { followUp: {
    action: 'Follow-up call', at: due.toISOString(), date: dueIst.toISOString().slice(0, 10),
    time: dueIst.toISOString().slice(11, 16), note: 'Test due now' } });
  made.push(`5  ${l5}`);
  // 6. A remark the owner writes on the agent's lead: drawer only.
  const l6 = await lead(6, 'Remark');
  await sleep(500);
  await call(owner.token, 'POST', `/records/${l6}/actions/remark`, { text: 'Owner: please call before 6 pm' });
  made.push(`6  ${l6}`);
  // 7. Two owners added to the agent's calling list: one `morning` alert.
  const o: string[] = [];
  for (const [k, x] of [[1, 'A'], [2, 'B']] as const) {
    o.push((await call(owner.token, 'POST', '/owners', { name: `TEST 7 · Owner ${x}`, phone: phone(70 + k), project: 'Test Towers', agentId: agent.id })).data?.id
      ?? (await db`SELECT id FROM crm_owners WHERE tenant_id = ${TENANT} AND name = ${`TEST 7 · Owner ${x}`}`)[0]?.id);
  }
  made.push(`7  ${o.join(', ')}`);

  console.log(`\nCases for ${agent.name}, made by ${owner.name}:\n  ${made.join('\n  ')}`);
  console.log('\nWaiting for the owner alert (it waits 20 s for an import to finish) and the sweep (every minute)…');
  await sleep(75_000);
  const alerts = await db`
    SELECT n.type, n.urgency, n.title, n.body, n.closed_at IS NOT NULL AS closed,
           to_char(n.send_after AT TIME ZONE 'Asia/Kolkata', 'DD Mon HH24:MI') AS buzzes, n.pushed_at IS NOT NULL AS pushed
      FROM notifications n
     WHERE n.tenant_id = ${TENANT} AND n.user_id = ${agent.id}
       AND n.record_ids && ${[...batch, ...o, ...made.map(m => m.split(/\s+/)[1])]}
     ORDER BY n.created_at`;
  console.table(alerts);
}

main().catch(e => { console.error('✗', e?.message || e); process.exitCode = 1; }).finally(() => db.end());

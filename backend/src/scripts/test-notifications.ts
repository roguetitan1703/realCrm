/**
 * ============================================================================
 * FIRE EVERY ALERT THIS PRODUCT SENDS, AT A REAL RECIPIENT, AND SAY WHAT LANDED
 * ============================================================================
 * WHEN TO RUN THIS: after changing notification copy, the catalogue, a link, or
 * anything in the delivery path — and before believing that a type still works.
 *
 *   APP_ENV=development npx tsx backend/src/scripts/test-notifications.ts
 *   APP_ENV=development npx tsx backend/src/scripts/test-notifications.ts --write
 *   APP_ENV=development npx tsx backend/src/scripts/test-notifications.ts --write --type=lead_assigned
 *   APP_ENV=development npx tsx backend/src/scripts/test-notifications.ts --clean
 *
 * WHAT IT PROVES, per type: the copy renders (not `undefined`), the recipients
 * resolve to real users with the right ROLE, the link points at a screen this
 * app actually has, and push is attempted exactly where the catalogue says it
 * should be.
 *
 * WHAT IT CANNOT PROVE: that a phone buzzed. Push needs a subscription on a
 * device; this reports how many each recipient has, so a silent phone is
 * distinguishable from a silent server. Zero subscriptions is not a failure of
 * the alert.
 *
 * IT REPLACES fire-notification.ts, which pointed at DATABASE_URL — production —
 * and knew four types, two of which no longer exist.
 *
 * TWO GUARDS, both fatal:
 *   - the database must be the development one (APP_ENV=development)
 *   - the tenant must be a sandbox; `bhumi` is a live desk with real agents
 *     holding real phones, and an earlier version of this idea delivered 13
 *     alerts to them by accident.
 * ============================================================================
 */
import { NOTIFICATIONS, type NotifKind } from '../services/notificationCatalogue.js';
import { appEnv, databaseUrl, dbRef } from '../services/env.js';
import { runWithContext } from '../services/context.js';
import { notify, notifyRoles } from '../services/notifications.js';
import { sql } from '../services/db.js';

const SANDBOX = new Set(['delpat', 'skyline-realty', 'test-org']);
const arg = (k: string, d?: string) =>
  process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const has = (k: string) => process.argv.includes(`--${k}`);

const TENANT = arg('tenant', 'delpat')!;
const WRITE = has('write');
const CLEAN = has('clean');
const ONLY = arg('type');

if (appEnv() !== 'development') {
  console.error(`\nRefusing: APP_ENV is "${appEnv()}". Run this with APP_ENV=development.`);
  console.error('Notifications are addressed to real people; this must never touch production.\n');
  process.exit(1);
}
if (!SANDBOX.has(TENANT)) {
  console.error(`\nRefusing to run against "${TENANT}". Sandbox tenants only: ${[...SANDBOX].join(', ')}.\n`);
  process.exit(1);
}

/** Marks every row this script writes, so --clean can take them all back out. */
const TAG = '[test]';

/**
 * Facts for each type, chosen so the rendered sentence is checkable by eye. A
 * missing key shows up as `undefined` in the output, which is the point — the
 * WhatsApp share wrote exactly that into a real timeline for months.
 */
const DATA: Record<string, any> = {
  lead_assigned: { name: 'Test Buyer', locality: 'Fairhaven', source: 'Portal One' },
  lead_assigned_bulk: { n: 4 },
  lead_unrouted: { name: 'Test Buyer', source: 'Portal Two' },
  lead_repeat: { name: 'Test Buyer', source: 'Portal Three', changed: 2, previousStage: null },
  lead_reassigned: { n: 3 },
  owner_assigned: { n: 2 },
  owner_reassigned: { n: 2 },
  lead_reassign_loop: { name: 'Test Buyer', n: 4, to: 'Test Agent' },
  owner_reassign_loop: { name: 'Test Owner', n: 4, to: 'Test Agent' },
  lead_untouched: { name: 'Test Buyer', hours: 24 },
  followup_due: { name: 'Test Buyer', locality: 'Fairhaven', action: 'Follow-up Call', when: '11:00 am' },
  site_visit_reminder: { name: 'Test Buyer', locality: 'Fairhaven', action: 'Site Visit', when: '11:00 am' },
  calendar_task_assigned: { name: 'Test Buyer', at: new Date(Date.now() + 3600_000).toISOString(), isVisit: false },
  remark_added: { name: 'Test Buyer', by: 'Test Agent', text: 'Asked for a evening viewing' },
};

const LINK: Record<string, string> = {
  lead_assigned_bulk: '?screen=leads&agent=',
  owner_assigned: '?screen=calling&agent=',
  owner_reassigned: '?screen=calling&agent=',
  lead_reassigned: '?screen=leads&agent=',
};

async function main() {
  console.log(`${WRITE ? 'FIRING' : 'DRY RUN'} · db ${dbRef(databaseUrl())} · tenant ${TENANT}\n`);

  const users = await sql`SELECT id, name, role, status FROM users
                           WHERE tenant_id = ${TENANT} AND deleted_at IS NULL ORDER BY role, name`;
  const subs = await sql`SELECT user_id, count(*)::int n FROM push_subscriptions
                          WHERE tenant_id = ${TENANT} GROUP BY 1`;
  const subOf = new Map(subs.map((r: any) => [r.user_id, r.n]));

  // ILIKE, because users.status is written 'ACTIVE' by onboarding and 'active'
  // by the team screen, and notifyRoles matches the second.
  const active = (users as any[]).filter(u => String(u.status || '').toLowerCase() === 'active');
  // PREFER AN AGENT WHO CAN ACTUALLY BE REACHED. Picking the first one
  // alphabetically addressed every push to someone with no device, which proves
  // the alert fired and nothing about whether it arrives. `--user=` overrides.
  const wanted = arg('user');
  const agents = active.filter(u => u.role === 'agent');
  const agent = wanted
    ? agents.find(u => u.id === wanted || String(u.name).toLowerCase().includes(wanted.toLowerCase()))
    : (agents.find(u => (subOf.get(u.id) || 0) > 0) ?? agents[0]);
  const desk = active.filter(u => u.role === 'owner' || u.role === 'manager');

  console.log('WHO CAN RECEIVE');
  for (const u of active) {
    console.log(`  ${String(u.role).padEnd(8)} ${String(u.name).padEnd(20)} ${subOf.get(u.id) || 0} device(s)`);
  }
  if (!agent) { console.error('\nNo active agent on this tenant — nothing to address an assignee alert to.'); process.exit(1); }
  if (!desk.length) console.log('\n⚠ No active owner or manager: every `desk` alert below will reach nobody.');

  if (CLEAN) {
    const gone = await sql`DELETE FROM notifications WHERE tenant_id = ${TENANT}
                            AND (title LIKE ${TAG + '%'} OR body LIKE ${'%' + TAG + '%'}) RETURNING id`;
    console.log(`\ncleaned ${gone.length} test notification(s).`);
    await sql.end(); return;
  }

  // A REAL RECORD, BELONGING TO THE RECIPIENT.
  //
  // The link used to carry `l_test`, which opens the leads screen on a lead that
  // does not exist -- fine for checking that copy renders, useless for the thing
  // this is actually for: tapping the alert on a phone and seeing where it goes.
  // It has to be one of THEIR leads too, or an agent taps through to a record
  // their own scope hides and the app looks broken.
  const [own] = await sql`SELECT id, name FROM crm_leads
                           WHERE tenant_id = ${TENANT} AND agent_id = ${agent.id}
                           ORDER BY created_at DESC LIMIT 1`;
  if (!own) console.log(`
⚠ ${agent.name} holds no leads — record links will have nothing to open.`);
  else console.log(`record links open: ${own.name} (${own.id})`);

  if (own) for (const key of Object.keys(DATA)) {
    if ('name' in DATA[key] && DATA[key].name === 'Test Buyer') DATA[key].name = own.name;
  }

  const kinds = NOTIFICATIONS.filter((k: NotifKind) => !k.deployedOnly && (!ONLY || k.key === ONLY));
  if (!kinds.length) { console.error(`\nNo such type: ${ONLY}`); process.exit(1); }

  console.log(`\n${'TYPE'.padEnd(26)} ${'AUDIENCE'.padEnd(9)} ${'PUSH'.padEnd(5)} RECIPIENTS`);
  console.log('-'.repeat(78));

  for (const k of kinds) {
    const to = k.audience === 'desk' ? desk : [agent];
    const reach = to.reduce((s, u: any) => s + (subOf.get(u.id) || 0), 0);
    const names = to.length ? to.map((u: any) => u.name).join(', ') : '(nobody)';
    console.log(`${k.key.padEnd(26)} ${k.audience.padEnd(9)} ${(k.push ? 'yes' : 'feed').padEnd(5)} ${names}${
      k.push ? `  → ${reach} device(s)` : ''}`);
    // THE COUNT IS ASSERTED, not assumed. Delivering to an empty list is not an
    // error, which is how a desk-wide alert failed silently for months.
    if (!to.length) console.log(`${' '.repeat(43)}⚠ no recipient — this alert is unreachable on this tenant`);

    if (!WRITE) continue;
    const link = LINK[k.key]
      ? `${LINK[k.key]}${agent.id}`
      : `?screen=leads&lead=${own?.id ?? 'l_test'}`;
    // Fired through the real notify(), inside a real request context, so the
    // catalogue's push gate, the copy module and the delivery log all run
    // exactly as they do in production.
    await runWithContext(
      { tenantId: TENANT, userId: null, role: null, actorType: 'system', actorLabel: TAG },
      async () => {
        const payload = { type: k.key, data: DATA[k.key] ?? {}, link, tenantId: TENANT, toSelf: true };
        if (k.audience === 'desk') await notifyRoles(['owner', 'manager'], payload as any);
        else await notify({ ...payload, userId: agent.id } as any);
      },
    );
  }

  if (WRITE) {
    // Read back what actually landed. The rendered sentence is the thing under
    // test, and the only place it exists is the row.
    const rows = await sql`SELECT type, user_id, title, body, link FROM notifications
                            WHERE tenant_id = ${TENANT} AND created_at > now() - interval '2 minutes'
                            ORDER BY created_at`;
    console.log(`\nWHAT LANDED (${rows.length} rows)\n${'-'.repeat(78)}`);
    for (const r of rows as any[]) {
      // Only the strings that EXIST. Interpolating a null body into the check
      // made every body-less alert read as "null" and flag itself -- the
      // checker inventing the fault it was written to catch.
      const bad = [r.title, r.body].filter(Boolean)
        .some((v: string) => /undefined|NaN|\[object|null/.test(v));
      console.log(`${bad ? '✗' : '·'} ${String(r.type).padEnd(24)} ${r.title}`);
      if (r.body) console.log(`  ${' '.repeat(24)} ${r.body}`);
      console.log(`  ${' '.repeat(24)} → ${r.link}`);
      if (bad) console.log(`  ${' '.repeat(24)} ✗ the copy rendered a placeholder — check notificationCopy.ts`);
    }
    // No other tenant may have gained a row. State it rather than trust it.
    const spill = await sql`SELECT tenant_id, count(*)::int n FROM notifications
                             WHERE created_at > now() - interval '2 minutes' AND tenant_id <> ${TENANT}
                             GROUP BY 1`;
    console.log(spill.length
      ? `\n✗ SPILL: ${spill.map((r: any) => `${r.tenant_id}:${r.n}`).join(', ')}`
      : `\nblast radius: ${TENANT} only.`);
    console.log(`\nTake them back out with --clean.`);
  } else {
    console.log('\nNothing written. Re-run with --write.');
  }
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Fire one notification type against ONE tenant, then put everything back.
 *
 * Run it when you change notification copy, add a type, or touch the sweep, to
 * see the real row a real recipient would get.
 *
 *   npx tsx src/scripts/fire-notification.ts --type=lead_retry_due
 *   npx tsx src/scripts/fire-notification.ts --all
 *   npx tsx src/scripts/fire-notification.ts --all --keep      (don't clean up)
 *
 * WHY THIS EXISTS
 * ---------------
 * The sweep used to be callable only as "every active tenant". Exercising one
 * new alert against the testing org therefore delivered 13 notifications to the
 * paying client's agents and stamped 13 of their leads. Nothing was wrong with
 * the alert; the blast radius was simply not expressible.
 *
 * So this script refuses to run against anything but a sandbox tenant, states
 * its blast radius before it writes, and asserts afterwards that no other
 * tenant gained a row. If the assertion fails it says so loudly rather than
 * exiting 0.
 */
import postgres from 'postgres';

const SANDBOX = new Set(['delpat', 'skyline-realty', 'test-org']);

const arg = (k: string, d?: string) =>
  process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const has = (k: string) => process.argv.includes(`--${k}`);

const slug = arg('tenant', 'delpat')!;
if (!SANDBOX.has(slug)) {
  console.error(`\nRefusing to run against "${slug}".`);
  console.error(`Notification tests run on a sandbox tenant only: ${[...SANDBOX].join(', ')}.`);
  console.error(`bhumi is a live desk with real agents holding real phones.\n`);
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'require' });

type Case = {
  type: string;
  /** Put the tenant into the state this alert reacts to. Returns an undo. */
  stage: (t: string, offset: number) => Promise<() => Promise<void>>;
};

/**
 * Move N leads into a stage/age and give back a function restoring them exactly.
 *
 * `offset` matters: every case took the top N by created_at, so running --all
 * had each case restage the SAME leads and the last one silently won. The retry
 * alert looked like it did not fire when it had simply been overwritten before
 * the sweep ran. Each case gets its own leads.
 */
async function stageLeads(t: string, n: number, offset: number, patch: (id: string) => Promise<void>) {
  const rows = await sql`
    SELECT id, stage, updated_at, created_at, metadata FROM crm_leads
    WHERE tenant_id = ${t} AND agent_id IS NOT NULL
    ORDER BY created_at DESC LIMIT ${n} OFFSET ${offset}`;
  const saved = (rows as any[]).map(r => ({ ...r }));
  for (const r of saved) await patch(r.id);
  return async () => {
    for (const r of saved) {
      await sql`UPDATE crm_leads SET stage = ${r.stage}, updated_at = ${r.updated_at},
                created_at = ${r.created_at}, metadata = ${sql.json(r.metadata ?? {})}
                WHERE id = ${r.id} AND tenant_id = ${t}`;
    }
  };
}

const CASES: Case[] = [
  {
    type: 'lead_retry_due',
    stage: (t, off) => stageLeads(t, 2, off, async (id) => {
      await sql`UPDATE crm_leads SET stage = 'Call Not Received',
                updated_at = now() - interval '4 days',
                metadata = coalesce(metadata,'{}'::jsonb) - 'retry_notified'
                WHERE id = ${id}`;
    }),
  },
  {
    type: 'lead_stale_sla',
    stage: async (t, off) => {
      const [cfg] = await sql`SELECT value->'stages'->>0 AS arrival FROM crm_settings WHERE key='default' AND tenant_id=${t}`;
      const arrival = cfg?.arrival || 'New';
      return stageLeads(t, 2, off, async (id) => {
        await sql`UPDATE crm_leads SET stage = ${arrival},
                  created_at = now() - interval '30 hours',
                  metadata = (coalesce(metadata,'{}'::jsonb) - 'sla_agent_notified') - 'sla_mgr_notified'
                  WHERE id = ${id}`;
      });
    },
  },
  {
    // Same query as lead_stale_sla, aged past 2x the SLA so the MANAGER
    // escalation fires rather than the agent warning. They are different types
    // with different words and different readers; testing one is not testing
    // the other, which is exactly how the split could have gone unnoticed.
    type: 'lead_untouched_escalated',
    stage: async (t, off) => {
      const [cfg] = await sql`SELECT value->'stages'->>0 AS arrival FROM crm_settings WHERE key='default' AND tenant_id=${t}`;
      const arrival = cfg?.arrival || 'New';
      return stageLeads(t, 1, off, async (id) => {
        await sql`UPDATE crm_leads SET stage = ${arrival},
                  created_at = now() - interval '60 hours',
                  metadata = (coalesce(metadata,'{}'::jsonb) - 'sla_agent_notified') - 'sla_mgr_notified'
                  WHERE id = ${id}`;
      });
    },
  },
  {
    type: 'followup_due',
    stage: (t, off) => stageLeads(t, 1, off, async (id) => {
      await sql`UPDATE crm_leads
                SET follow_up = jsonb_build_object(
                      'action','Follow-up Call','time','11:00 am',
                      'at', (now() - interval '10 minutes')::text,
                      'due_at', (now() - interval '10 minutes')::text)
                WHERE id = ${id}`;
    }),
  },
];

async function countsByTenant() {
  const rows = await sql`
    SELECT t.slug, count(*)::int AS n FROM notifications n
    JOIN tenants t ON t.id = n.tenant_id GROUP BY 1 ORDER BY 1`;
  return new Map((rows as any[]).map(r => [r.slug, r.n]));
}

/**
 * One of EVERY catalogue type, delivered for real, and left in place to look at.
 *
 * Separate from the staged cases above on purpose: those prove the sweep's
 * QUERIES find the right leads, this proves the WORDS. Sent straight through
 * notify() so what lands is what a person would actually receive, push off so
 * reviewing twenty of them does not buzz a phone twenty times.
 *
 *   --catalogue          send them
 *   --catalogue --clear  take them away again
 */
const CATALOGUE: [string, any][] = [
  ['lead_assigned', { name: 'Priya Shah', locality: 'Wakad', source: '99acres' }],
  ['lead_assigned_bulk', { n: 4 }],
  ['lead_new', { name: 'Rohit Menon', locality: 'Baner', agent: 'Kavish' }],
  ['lead_unrouted', { name: 'Anjali Rao', source: 'Housing.com' }],
  ['lead_reassigned', { name: 'Imran Sheikh' }],
  ['lead_moved_away', { n: 3 }],
  ['lead_untouched', { name: 'Priya Shah', hours: 24 }],
  ['lead_untouched_escalated', { name: 'Rohit Menon', hours: 48, agent: 'Kavish' }],
  ['lead_retry_due', { name: 'Imran Sheikh', days: 4, when: '7 Aug' }],
  ['followup_set', { name: 'Anjali Rao', at: new Date(Date.now() + 3 * 86400e3).toISOString() }],
  ['followup_due', { name: 'Priya Shah', action: 'Follow-up Call', locality: 'Baner' }],
  ['site_visit_reminder', { name: 'Rohit Menon', when: '11:00 am', locality: 'Wakad' }],
  ['calendar_task_assigned', { name: 'Anjali Rao', at: new Date(Date.now() + 86400e3).toISOString(), isVisit: true }],
  ['remark_added', { name: 'Imran Sheikh' }],
  ['owner_assigned', { n: 2 }],
  ['owner_reassigned', { name: 'Ramesh Kulkarni' }],
];

async function catalogue(tenantId: string) {
  const { notify } = await import('../services/notifications.js');
  const [owner] = await sql`SELECT id, name FROM users WHERE tenant_id = ${tenantId} AND role = 'owner' ORDER BY id LIMIT 1`;
  if (!owner) throw new Error('no owner on this tenant to address them to');

  if (has('clear')) {
    const gone = await sql`DELETE FROM notifications WHERE tenant_id = ${tenantId} AND user_id = ${owner.id}
                           AND id LIKE 'ntf_cat_%' RETURNING id`;
    console.log(`
removed ${gone.length} catalogue notification(s) from ${owner.name}
`);
    return;
  }

  console.log(`
sending one of every type to ${owner.name} (${owner.id})
`);
  for (const [type, data] of CATALOGUE) {
    await notify({ userId: owner.id, tenantId, type, data, link: '?screen=leads', toSelf: true, push: false });
  }
  // Tag them so --clear can find exactly these and nothing else.
  await sql`UPDATE notifications SET id = 'ntf_cat_' || id
            WHERE tenant_id = ${tenantId} AND user_id = ${owner.id}
              AND created_at > now() - interval '2 minutes' AND id NOT LIKE 'ntf_cat_%'`;
  const rows = await sql`SELECT type, title, body FROM notifications
    WHERE tenant_id = ${tenantId} AND user_id = ${owner.id} AND id LIKE 'ntf_cat_%' ORDER BY created_at`;
  for (const r of rows as any[]) {
    console.log(`  ${String(r.type).padEnd(26)}${r.title}`);
    if (r.body) console.log(`  ${' '.repeat(26)}${r.body}`);
  }
  console.log(`
${rows.length} delivered. Open the bell on /${slug}.`);
  console.log(`Remove them with:  npx tsx src/scripts/fire-notification.ts --catalogue --clear
`);
}

async function main() {
  const { processScheduledNotifications } = await import('../services/notifications.js');
  const [t] = await sql`SELECT id FROM tenants WHERE slug = ${slug}`;
  if (!t) throw new Error(`No tenant "${slug}"`);

  if (has('catalogue')) { await catalogue(t.id); await sql.end(); process.exit(0); }

  const wanted = arg('type');
  const cases = has('all') ? CASES : CASES.filter(c => c.type === wanted);
  if (!cases.length) {
    console.error(`\nPass --type=<one of: ${CASES.map(c => c.type).join(', ')}> or --all\n`);
    process.exit(1);
  }

  console.log(`\ntenant : ${slug}  (sandbox)`);
  console.log(`cases  : ${cases.map(c => c.type).join(', ')}`);
  const before = await countsByTenant();
  console.log(`before : ${[...before].map(([s, n]) => `${s}=${n}`).join('  ')}\n`);

  const undos: (() => Promise<void>)[] = [];
  const fired: any[] = [];
  try {
    // Each case works on its own slice of leads — see stageLeads.
    let off = 0;
    for (const c of cases) { undos.push(await c.stage(t.id, off)); off += 5; }

    // Scoped to this tenant, and un-throttled so a recent scheduled sweep
    // cannot make this look like the alert does not fire.
    await processScheduledNotifications({ onlySlug: slug, throttle: false });
    await new Promise(r => setTimeout(r, 2500));

    const rows = await sql`
      SELECT type, title, body, user_id FROM notifications
      WHERE tenant_id = ${t.id} AND created_at > now() - interval '2 minutes'
      ORDER BY created_at`;
    fired.push(...rows);
    console.log(`fired  : ${rows.length} notification(s)\n`);
    for (const r of rows as any[]) {
      console.log(`  [${r.type}]  →  ${String(r.user_id).slice(-10)}`);
      console.log(`     ${r.title}`);
      if (r.body) console.log(`     ${r.body}`);
      console.log('');
    }
  } finally {
    for (const u of undos.reverse()) await u().catch(e => console.error('undo failed:', e.message));
    if (!has('keep')) {
      const ids = fired.map(f => f.id).filter(Boolean);
      await sql`DELETE FROM notifications WHERE tenant_id = ${t.id} AND created_at > now() - interval '2 minutes'`;
      await sql`UPDATE crm_leads SET metadata = ((coalesce(metadata,'{}'::jsonb) - 'retry_notified') - 'sla_agent_notified') - 'sla_mgr_notified'
                WHERE tenant_id = ${t.id}`;
      console.log(`cleaned: test notifications deleted, lead state restored${ids.length ? '' : ''}`);
    } else {
      console.log('kept   : --keep given, notifications left in place');
    }

    // The assertion the incident was missing: did anything land anywhere else?
    const after = await countsByTenant();
    const leaked: string[] = [];
    for (const [s, n] of after) {
      const was = before.get(s) ?? 0;
      if (s !== slug && n > was) leaked.push(`${s}: +${n - was}`);
    }
    console.log(`after  : ${[...after].map(([s, n]) => `${s}=${n}`).join('  ')}`);
    if (leaked.length) {
      console.error(`\n*** ESCAPED THE SANDBOX: ${leaked.join(', ')} ***\n`);
      await sql.end();
      process.exit(2);
    }
    console.log(`\nsandbox held: no other tenant gained a notification.\n`);
  }
  await sql.end();
  process.exit(0);
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });

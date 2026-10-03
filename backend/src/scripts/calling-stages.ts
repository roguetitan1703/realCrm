/**
 * ============================================================================
 * CALLING STATUSES — one simple list, for every firm (one-off)
 * ============================================================================
 * The shipped list was New · Contacted · Callback · Interested · Not Interested
 * · Do Not Call, and each firm keeps its own copy in crm_settings the moment it
 * edits anything. Two problems with it:
 *
 *   • "Callback" is a TIME, not a status. It is held in callback_at with its own
 *     pill and its own sort, so as a status it said nothing about the
 *     conversation — and a record could read "Callback" with no callback on it.
 *   • The two endings are not steps forward. They are now set through Reject,
 *     with a reason (see RejectOwnerModal), so they no longer belong in the walk.
 *
 * The walk becomes: New → Contacted → Interested → Key Received, which is where
 * this pipeline actually ends — the flat is ours to manage.
 *
 * This rewrites each firm's stored list and moves any record sitting on a
 * dropped status onto the nearest honest one (Callback → Contacted, keeping the
 * callback time). The endings stay in the vocabulary; the server appends them.
 *
 * 2026-10-03: the walk gained Call Not Received · Incoming Not Available ·
 * Switch Off after New. A firm with a stored list never sees a new default, so
 * this now ADDS whatever of the walk is missing, each after the step before it,
 * and keeps every status the firm named itself, in the firm's order.
 *
 * Usage:
 *   npm run stages:calling -- --env=production                 report, all firms
 *   npm run stages:calling -- --env=production --apply         do it
 *   npm run stages:calling -- --env=production --tenant=bhumi --apply
 * ============================================================================
 */
import postgres from 'postgres';

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const env = String(arg('env') || '').toLowerCase();
if (env !== 'production' && env !== 'development') {
  console.error('\nRefusing to run without --env=production or --env=development.\n');
  process.exit(1);
}
process.env.APP_ENV = env;
const only = arg('tenant') || null;
const apply = process.argv.includes('--apply');

const { databaseUrl, dbRef } = await import('../services/env');
const sql = postgres(databaseUrl(), { max: 1, ssl: 'require' });

/** The walk. The endings are deliberately absent — Reject sets those. */
const WALK = ['New', 'Call Not Received', 'Incoming Not Available', 'Switch Off', 'Contacted', 'Interested', 'Key Received'];
const ENDINGS = ['Not Interested', 'Do Not Call'];
/** What a record sitting on a dropped status becomes. */
const MOVED: Record<string, string> = { Callback: 'Contacted' };

/** The firm's list with the missing steps of the walk put in, each after the
 *  nearest step before it that the list has. Nothing the firm named is lost. */
function merged(current: string[]): string[] {
  const out = current.filter(s => !MOVED[s] && !ENDINGS.includes(s));
  WALK.forEach((s, i) => {
    if (out.includes(s)) return;
    const prev = WALK.slice(0, i).reverse().find(p => out.includes(p));
    out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, s);
  });
  return out;
}

console.log(`\n  ${env.toUpperCase()} · db ${dbRef(databaseUrl())}${only ? ` · tenant ${only}` : ''}${apply ? '' : ' · report only'}\n`);

const rows = await sql`
  SELECT t.id AS tenant, s.value->'ownerStages' AS stages
    FROM tenants t
    LEFT JOIN crm_settings s ON s.tenant_id = t.id AND s.key = 'default'
   ${only ? sql`WHERE t.id = ${only}` : sql``}
   ORDER BY t.id`;

let changed = 0, movedRows = 0;
for (const r of rows as any[]) {
  const current: string[] | null = Array.isArray(r.stages) ? r.stages : null;
  const counts = await sql`
    SELECT coalesce(stage, 'New') AS stage, count(*)::int AS n
      FROM crm_owners WHERE tenant_id = ${r.tenant}
     GROUP BY 1 ORDER BY 2 DESC`;
  const onDropped = (counts as any[]).filter(c => MOVED[c.stage]);
  const custom = current ? current.join(' · ') : '(the shipped list)';
  // A firm with no stored list is already on the shipped one, which IS the new
  // walk — there is nothing to write and saying otherwise reads as work pending.
  const needsList = Boolean(current) && (WALK.some(s => !current!.includes(s)) || current!.some(s => MOVED[s]));
  if (!needsList && !onDropped.length) { console.log(`  ${String(r.tenant).padEnd(16)} already fine`); continue; }
  console.log(`  ${String(r.tenant).padEnd(16)} ${custom}`);
  if (current) console.log(`  ${''.padEnd(16)} becomes: ${[...merged(current), ...ENDINGS].join(' · ')}`);
  if (onDropped.length) console.log(`  ${''.padEnd(16)} records to move: ${onDropped.map(c => `${c.n} × ${c.stage} → ${MOVED[c.stage]}`).join(', ')}`);

  if (!apply) continue;

  for (const c of onDropped as any[]) {
    const done = await sql`
      UPDATE crm_owners SET stage = ${MOVED[c.stage]}, updated_at = NOW()
       WHERE tenant_id = ${r.tenant} AND stage = ${c.stage} RETURNING id`;
    movedRows += done.length;
  }
  // The endings are appended by updateSettings for every write; kept here so a
  // firm's stored vocabulary still carries them when nothing goes through that.
  const next = current ? [...merged(current), ...ENDINGS] : [...WALK, ...ENDINGS];
  if (current) {
    await sql`
      UPDATE crm_settings
         SET value = jsonb_set(value, '{ownerStages}', ${sql.json(next)}::jsonb)
       WHERE tenant_id = ${r.tenant} AND key = 'default'`;
  } else {
    // No stored settings row: the firm is on the shipped list, which is already
    // the new one. Nothing to write.
  }
  changed++;
}

if (!apply) console.log('\n  Run again with --apply to write it.\n');
else console.log(`\n  ${changed} firm(s) updated, ${movedRows} record(s) moved off a dropped status.\n`);
await sql.end();
process.exit(0);

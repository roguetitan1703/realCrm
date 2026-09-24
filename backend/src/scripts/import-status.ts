/**
 * ============================================================================
 * STATUS FROM THE SHEET — for owners imported before the importer read it
 * ============================================================================
 * Until the Status field existed, a calling sheet's "Call Status" column was
 * dropped on import, and every row arrived as New — including the people who
 * had already said no, and numbers already known to be wrong. The sheet itself
 * is still stored (crm_import_rows), so the answer can be read back from it.
 *
 * This reads each finished owners import, takes the status column (the one the
 * import mapped, else the first column the importer would match that has
 * anything in it), translates it
 * with statusFromSheet — the SAME rules the importer uses — and applies it the
 * way an import does now: stage, rejection reason, and an "Imported as …" note
 * authored Import, which is not a person and so is nobody's activity.
 *
 * It leaves alone:
 *   • a record no longer at New, or one a person has touched (any event not
 *     written by the import or an assignment) — their word beats the sheet's;
 *   • a record that already carries a sheet-status note, so a second run is 0;
 *   • rows the import skipped as already on file: the sheet row is not the
 *     record that exists, and guessing which is which is how facts get invented.
 *
 * Usage (run when an owners import predates the Status field):
 *   npm run imports:status -- --env=production --tenant=<slug>            report
 *   npm run imports:status -- --env=production --tenant=<slug> --apply    do it
 *   add --job=<import id> to limit it to one import
 * ============================================================================
 */
import postgres from 'postgres';
import { randomBytes } from 'crypto';
import { statusFromSheet } from '../../../src/data/ownerStatus.js';

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const env = String(arg('env') || '').toLowerCase();
const tenant = arg('tenant');
if ((env !== 'production' && env !== 'development') || !tenant) {
  console.error('\nRefusing to run without --env=production|development and --tenant=<slug>.\n');
  process.exit(1);
}
process.env.APP_ENV = env;
const onlyJob = arg('job') || null;
const apply = process.argv.includes('--apply');

const { databaseUrl, dbRef } = await import('../services/env');
const sql = postgres(databaseUrl(), { max: 1, ssl: 'require' });

/** The importer's own match order for the Status field (src/lib/importSchema.js). */
const STATUS_HEADERS = ['call status', 'status', 'feedback', 'call feedback', 'outcome', 'disposition', 'call result'];
const norm = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

console.log(`\n  ${env.toUpperCase()} · db ${dbRef(databaseUrl())} · tenant ${tenant}${onlyJob ? ` · job ${onlyJob}` : ''}${apply ? '' : ' · report only'}\n`);

const jobs = await sql`
  SELECT id, file_name, sheet_name, headers, mapping FROM crm_import_jobs
   WHERE tenant_id = ${tenant} AND kind = 'owners' AND status = 'done'
   ${onlyJob ? sql`AND id = ${onlyJob}` : sql``}
   ORDER BY created_at`;

type Change = { id: string; stage: string | null; reason: string | null; said: string; known: boolean };
const changes: Change[] = [];
const claimed = new Set<string>();

for (const j of jobs as any[]) {
  const headers: string[] = j.headers || [];
  // The mapped column, else the first candidate that has anything in it: the
  // Owner Calling sheet carries an empty "Call Status" and keeps its outcomes
  // (cnc, cnr, wrong no.) under "Feedback".
  let col: string | undefined = j.mapping?.status;
  for (const h of STATUS_HEADERS) {
    if (col) break;
    const name = headers.find(x => norm(x) === h);
    if (!name) continue;
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM crm_import_rows WHERE job_id = ${j.id} AND coalesce(trim(raw->>${name}), '') <> ''`;
    if (n > 0) col = name;
  }
  const label = `${j.file_name} · ${j.sheet_name || '-'}`;
  if (!col) { console.log(`  ${label}\n    no status column\n`); continue; }

  const rows = await sql`
    SELECT r.row_no, r.raw, r.status AS row_status, r.record_id,
           coalesce(o.stage, 'New') AS stage, o.id AS owner_id,
           EXISTS (SELECT 1 FROM crm_timeline_events e WHERE e.record_id = o.id
                    AND coalesce(e.author, '') <> 'Import' AND e.type <> 'assignment') AS touched,
           EXISTS (SELECT 1 FROM crm_timeline_events e WHERE e.record_id = o.id
                    AND e.metadata->>'source' = 'import' AND e.metadata ? 'sheetStatus') AS has_note
      FROM crm_import_rows r
      LEFT JOIN crm_owners o ON o.id = r.record_id AND o.tenant_id = ${tenant}
     WHERE r.job_id = ${j.id}
     ORDER BY r.row_no`;

  const tally: Record<string, number> = {};
  const left: Record<string, number> = {};
  const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] || 0) + 1; };
  for (const r of rows as any[]) {
    const said = String(r.raw?.[col] ?? '').trim();
    if (!said) continue;
    if (r.row_status !== 'added') { bump(left, 'skipped at import (already on file)'); continue; }
    if (!r.owner_id) { bump(left, 'record since deleted'); continue; }
    if (r.has_note) { bump(left, 'already done'); continue; }
    if (r.stage !== 'New') { bump(left, `now ${r.stage} — left as is`); continue; }
    if (r.touched) { bump(left, 'worked by a person — left as is'); continue; }
    if (claimed.has(r.owner_id)) continue;
    claimed.add(r.owner_id);
    const t = statusFromSheet(said);
    changes.push({ id: r.owner_id, stage: t?.status || null, reason: t?.reason || null, said, known: Boolean(t) });
    bump(tally, t ? t.status : 'not recognised (note only, stays New)');
  }
  console.log(`  ${label}   column "${col}"`);
  for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(5)}  ${k}`);
  for (const [k, n] of Object.entries(left)) console.log(`    ${String(n).padStart(5)}  untouched: ${k}`);
  console.log('');
}

const moving = changes.filter(c => c.known && c.stage !== 'New');
console.log(`  ${moving.length} records change status · ${changes.length} get a sheet note · ${changes.length - moving.length} stay New\n`);

if (apply && changes.length) {
  // Grouped by what they become, so the status write is a handful of statements.
  // The stage guard is repeated in the WHERE: a record an agent moved between
  // the report and this line keeps what the agent gave it.
  const groups = new Map<string, Change[]>();
  for (const c of moving) {
    const k = `${c.stage}|${c.reason || ''}`;
    groups.set(k, [...(groups.get(k) || []), c]);
  }
  const moved = new Set<string>();
  for (const list of groups.values()) {
    const done = await sql`
      UPDATE crm_owners SET stage = ${list[0].stage}, rejection_reason = ${list[0].reason}, updated_at = NOW()
       WHERE tenant_id = ${tenant} AND coalesce(stage, 'New') = 'New' AND id IN ${sql(list.map(c => c.id))}
       RETURNING id`;
    for (const d of done as any[]) moved.add(d.id);
  }
  const stamp = Date.now();
  const notes = changes
    .filter(c => !c.known || c.stage === 'New' || moved.has(c.id))
    .map((c, i) => ({
      id: `evt_imps_${stamp}_${i}_${randomBytes(3).toString('hex')}`,
      record_id: c.id, type: 'note',
      title: c.known && c.stage !== 'New' ? `Imported as ${c.stage}` : 'From the imported sheet',
      description: `Sheet said: ${c.said}`,
      author: 'Import', timestamp: new Date().toISOString(),
      metadata: sql.json({ source: 'import', sheetStatus: c.said, stage: c.known ? c.stage : null }) as any,
      tenant_id: tenant,
    }));
  for (let i = 0; i < notes.length; i += 500) {
    await sql`INSERT INTO crm_timeline_events ${sql(notes.slice(i, i + 500), 'id', 'record_id', 'type', 'title', 'description', 'author', 'timestamp', 'metadata', 'tenant_id')}`;
  }
  console.log(`  applied: ${moved.size} status changes, ${notes.length} notes\n`);
}

await sql.end();

/**
 * ============================================================================
 * 📥 SPREADSHEET IMPORT — a job the server owns, row by row
 * ============================================================================
 * WHAT WENT WRONG. The import ran in the browser: it built a record per row and
 * fired one HTTP request per row, all at once. On 2026-09-22 a paying client's
 * 4,108-row owner list put 1,380 rows in the database. The other ~2,700 never
 * came back and nothing anywhere said which ones — the whole report was a count
 * in a toast. The undo lived in that tab's memory, so a reload lost it. And the
 * mapping screen quietly used columns nobody had mapped, gluing tower,
 * configuration and both areas into the unit field.
 *
 * WHAT THIS DOES INSTEAD.
 *   1. The file is parsed once and EVERY ROW IS STORED before anything is
 *      written, so the run can be checked, resumed and explained afterwards
 *      without asking for the file again.
 *   2. The preview counts come from these stored rows, so what was approved is
 *      what runs — the browser is no longer keeping its own opinion.
 *   3. The run works in batches, writing each row's outcome AND ITS REASON.
 *      "47 rows had no phone number" is a sentence the app can now say.
 *   4. Undo is a row in the database, not a button in one tab.
 *
 * THE RULES OF THE DATA (decided with the client, 2026-09-23):
 *   • A column that is not mapped is not used AND NOT KEPT. Nothing enters the
 *     database that nobody pointed at a field.
 *   • Identity is the UNIT: project + tower + unit number. One owner with three
 *     flats is three calling rows; the same flat twice in one file is the
 *     repeat. Phone is not identity — that is what silently dropped the second
 *     flat of every owner who had two.
 *   • Blank is blank. NULL / N/A / - are empty cells (see isBlankCell), and no
 *     name is ever invented.
 * ============================================================================
 */
import { randomBytes } from 'crypto';
import { sql, DEFAULT_TENANT_ID } from './db.js';
import { getContext } from './context.js';
import { audit } from './audit.js';
import { createOwnersBatch, createLead, createProperty, type ActorCtx } from './store.js';
import {
  OWNER_FIELDS, LEAD_FIELDS, PROPERTY_FIELDS, readField, normPhone,
} from '../../../src/lib/importSchema.js';

export type ImportKind = 'owners' | 'clients' | 'properties';

/** Same rule as store.ts: the workspace comes from the request, never a
 *  parameter a caller could get wrong. */
const tid = () => getContext()?.tenantId || DEFAULT_TENANT_ID;

const FIELDS: Record<ImportKind, any[]> = {
  owners: OWNER_FIELDS,
  clients: LEAD_FIELDS,
  properties: PROPERTY_FIELDS,
};

/** How many rows are written per statement. Big enough that 4,000 rows is eight
 *  round trips, small enough that one bad batch is a small thing to report. */
const BATCH = 500;

export type RowOutcome = 'added' | 'skipped' | 'failed' | 'pending';

// ---------------------------------------------------------------------------
// Identity — what makes two rows the same record
// ---------------------------------------------------------------------------

/** project + tower + unit, lower-cased and space-collapsed. The one definition,
 *  used for the file against itself AND against what is already on file. */
export function unitKey(project?: string | null, tower?: string | null, unit?: string | null): string | null {
  const part = (v?: string | null) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const u = part(unit);
  if (!u) return null;
  return [part(project), part(tower), u].join('|');
}

// ---------------------------------------------------------------------------
// Reading one row
// ---------------------------------------------------------------------------

export type Prepared = {
  ok: boolean;
  /** why this row cannot be saved — the sentence the person downloads */
  reason?: string;
  /** what makes it the same record as another row; see unitKey */
  key?: string | null;
  record?: Record<string, any>;
};

/**
 * One sheet row → the record we would save, or the reason we would not.
 *
 * Every reason is a sentence a person can act on ("No phone number"), because
 * this string is what the skipped-rows download will hand back to them.
 */
export function prepareRow(kind: ImportKind, raw: Record<string, any>, mapping: Record<string, string>): Prepared {
  const v: Record<string, any> = {};
  for (const f of FIELDS[kind]) {
    const got = readField(raw, mapping, f);
    if (got !== null) v[f.key] = got;
  }

  // WHY it could not be read, when the cell held something. "No phone number"
  // about a cell containing "9881204471 / 9822703786" sends somebody hunting
  // through a spreadsheet for a blank that is not there.
  const unreadablePhone = (col?: string) => {
    const cell = col ? String(raw[col] ?? '').trim() : '';
    return cell.replace(/\D/g, '').length
      ? `Phone number could not be read ("${cell.slice(0, 24)}")`
      : 'No phone number';
  };

  if (kind === 'owners') {
    if (!v.phone) return { ok: false, reason: unreadablePhone(mapping.phone) };
    if (!v.project) return { ok: false, reason: 'No project' };
    if (!v.unitNo) return { ok: false, reason: 'No unit number' };
    return {
      ok: true,
      key: unitKey(v.project, v.wing, v.unitNo),
      record: {
        // No name is a name nobody has. It stays empty.
        name: v.name || null,
        phone: v.phone,
        email: v.email || null,
        project: v.project,
        tower: v.wing || null,
        unitNo: v.unitNo,
        config: v.config || null,
        carpetArea: v.carpet ?? null,
        saleableArea: v.saleable ?? null,
        locality: v.locality || null,
        source: v.source || 'Spreadsheet import',
        notes: v.notes || null,
      },
    };
  }

  if (kind === 'clients') {
    // A lead with no name is ordinary — every portal sends them. A lead with no
    // number cannot be called, which is the whole job.
    if (!v.phone) return { ok: false, reason: unreadablePhone(mapping.phone) };
    return {
      ok: true,
      key: normPhone(v.phone) || null,
      record: {
        name: v.name || null, phone: v.phone, email: v.email || null,
        stage: v.stage || 'New', source: v.source || 'Spreadsheet import',
        deal: v.deal, locality: v.locality || null, config: v.config || null,
        minBudget: v.minBudget ?? null, maxBudget: v.maxBudget ?? null,
        interest: v.interest || null, purpose: v.purpose || null,
        timeline: v.timeline || null, notes: v.notes || null,
      },
    };
  }

  // properties
  if (!v.project) return { ok: false, reason: 'No project' };
  if (!v.title) return { ok: false, reason: 'No unit number' };
  // Sale or rent is never guessed: a blank read as "sale" prices a rental at
  // eighty-five lakh and nobody questions a filled-in field.
  if (!v.deal) return { ok: false, reason: 'Not marked sale or rent' };
  return {
    ok: true,
    key: unitKey(v.project, v.wing, v.title),
    record: {
      title: v.title, project: v.project, wing: v.wing || null, type: v.type || null,
      deal: v.deal, price: v.price ?? null, locality: v.locality || null,
      status: v.status || 'Available', carpet: v.carpet ?? null, floor: v.floor || null,
      totalFloors: v.totalFloors ?? null, facing: v.facing || null, furnishing: v.furnishing || null,
      parking: v.parking || null, possession: v.possession || null, age: v.age ?? null,
      builder: v.builder || null, rera: v.rera || null,
      owner: v.owner || null, ownerPhone: v.ownerPhone || null, ownerEmail: v.ownerEmail || null,
      notes: v.notes || null,
    },
  };
}

/** The keys this firm already holds, so "already on file" is answered once for
 *  the whole run rather than per row. */
async function existingKeys(kind: ImportKind): Promise<Set<string>> {
  const t = tid();
  const out = new Set<string>();
  if (kind === 'owners') {
    const rows = await sql`SELECT project, tower, unit_no FROM crm_owners WHERE tenant_id = ${t}`;
    for (const r of rows as any[]) { const k = unitKey(r.project, r.tower, r.unit_no); if (k) out.add(k); }
  } else if (kind === 'clients') {
    const rows = await sql`SELECT phone FROM crm_leads WHERE tenant_id = ${t} AND phone IS NOT NULL`;
    for (const r of rows as any[]) { const k = normPhone(r.phone); if (k) out.add(k); }
  } else {
    const rows = await sql`SELECT project, wing, title FROM crm_properties WHERE tenant_id = ${t}`;
    for (const r of rows as any[]) { const k = unitKey(r.project, r.wing, r.title); if (k) out.add(k); }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

export async function createImportJob(input: {
  kind: ImportKind; fileName?: string; sheetName?: string; sheetNames?: string[];
  headers: string[]; rows: Record<string, any>[]; mapping?: Record<string, string>;
}, ctx: ActorCtx = {}): Promise<any> {
  const t = tid();
  const id = `imp_${Date.now()}_${randomBytes(3).toString('hex')}`;
  await sql`
    INSERT INTO crm_import_jobs (id, tenant_id, kind, file_name, sheet_name, sheet_names, headers, mapping, status, total, created_by)
    VALUES (${id}, ${t}, ${input.kind}, ${input.fileName || null}, ${input.sheetName || null},
      ${sql.json(input.sheetNames || [])}, ${sql.json(input.headers || [])}, ${sql.json(input.mapping || {})},
      'uploaded', ${input.rows.length}, ${ctx.actorId ?? null})`;

  for (let i = 0; i < input.rows.length; i += BATCH) {
    const chunk = input.rows.slice(i, i + BATCH).map((raw, n) => ({
      job_id: id, row_no: i + n + 1, raw: sql.json(raw) as any, status: 'pending', reason: null, record_id: null,
    }));
    await sql`INSERT INTO crm_import_rows ${sql(chunk as any, 'job_id', 'row_no', 'raw', 'status', 'reason', 'record_id')}`;
  }
  return getImportJob(id);
}

/** More of the file, after the job exists. Chunked because a 4,000-row sheet is
 *  a few megabytes and one body should not have to carry it. */
export async function appendImportRows(id: string, rows: Record<string, any>[]): Promise<number> {
  const t = tid();
  const [job] = await sql`SELECT id, total FROM crm_import_jobs WHERE id = ${id} AND tenant_id = ${t} LIMIT 1`;
  if (!job) throw new Error('No such import');
  const [{ n }] = await sql`SELECT coalesce(max(row_no), 0)::int AS n FROM crm_import_rows WHERE job_id = ${id}`;
  let from = Number(n);
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map((raw, k) => ({
      job_id: id, row_no: from + i + k + 1, raw: sql.json(raw) as any, status: 'pending', reason: null, record_id: null,
    }));
    await sql`INSERT INTO crm_import_rows ${sql(chunk as any, 'job_id', 'row_no', 'raw', 'status', 'reason', 'record_id')}
      ON CONFLICT (job_id, row_no) DO NOTHING`;
  }
  const [{ total }] = await sql`SELECT count(*)::int AS total FROM crm_import_rows WHERE job_id = ${id}`;
  await sql`UPDATE crm_import_jobs SET total = ${total} WHERE id = ${id} AND tenant_id = ${t}`;
  return Number(total);
}

export async function getImportJob(id: string): Promise<any | null> {
  const t = tid();
  const [row] = await sql`SELECT * FROM crm_import_jobs WHERE id = ${id} AND tenant_id = ${t} LIMIT 1`;
  return row ? jobShape(row) : null;
}

export async function listImportJobs(limit = 20): Promise<any[]> {
  const t = tid();
  const rows = await sql`
    SELECT * FROM crm_import_jobs WHERE tenant_id = ${t}
     ORDER BY created_at DESC LIMIT ${limit}`;
  return (rows as any[]).map(jobShape);
}

function jobShape(r: any): any {
  return {
    id: r.id, kind: r.kind, fileName: r.file_name, sheetName: r.sheet_name,
    sheetNames: r.sheet_names || [], headers: r.headers || [], mapping: r.mapping || {},
    status: r.status, total: r.total, added: r.added, skipped: r.skipped, failed: r.failed,
    error: r.error || null, createdBy: r.created_by, createdAt: r.created_at,
    startedAt: r.started_at, finishedAt: r.finished_at, revertedAt: r.reverted_at,
  };
}

/**
 * What this mapping would do, counted over the WHOLE file — not the 50 rows a
 * review table can show. The same prepareRow the run uses, so the number the
 * person approves is the number that happens.
 */
export async function previewImport(id: string, mapping: Record<string, string>): Promise<any> {
  const t = tid();
  const [job] = await sql`SELECT * FROM crm_import_jobs WHERE id = ${id} AND tenant_id = ${t} LIMIT 1`;
  if (!job) return null;
  const kind = job.kind as ImportKind;
  const rows = await sql`SELECT row_no, raw FROM crm_import_rows WHERE job_id = ${id} ORDER BY row_no`;
  const onFile = await existingKeys(kind);
  const seen = new Set<string>();
  const counts = { total: rows.length, new: 0, repeatedInFile: 0, alreadyOnFile: 0, unusable: 0 };
  const reasons: Record<string, number> = {};
  const sample: any[] = [];
  /** How many rows of each group the review table gets to show. */
  const PER_STATUS = 50;
  const perStatus = new Map<string, number>();
  for (const r of rows as any[]) {
    const p = prepareRow(kind, r.raw, mapping);
    let status: string, reason: string | null = null;
    if (!p.ok) { status = 'unusable'; reason = p.reason || 'Unusable row'; counts.unusable++; reasons[reason] = (reasons[reason] || 0) + 1; }
    else if (p.key && seen.has(p.key)) { status = 'repeatedInFile'; reason = 'Same unit earlier in this file'; counts.repeatedInFile++; }
    else if (p.key && onFile.has(p.key)) { status = 'alreadyOnFile'; reason = 'Already on file'; counts.alreadyOnFile++; }
    else { status = 'new'; counts.new++; if (p.key) seen.add(p.key); }
    // A SAMPLE OF EACH GROUP, not the first 50 rows of the file. The review
    // table filters by status, and taking the head of the file meant the
    // "cannot import" tab showed 3 rows under a count of 20 — the other 17 were
    // further down the sheet. Per group, so every tab has something in it and
    // the counts above are still the whole file's.
    const room = perStatus.get(status) || 0;
    if (room < PER_STATUS) {
      perStatus.set(status, room + 1);
      sample.push({ rowNo: r.row_no, status, reason, record: p.ok ? p.record : null, raw: r.raw });
    }
  }
  sample.sort((a, b) => a.rowNo - b.rowNo);
  await sql`UPDATE crm_import_jobs SET mapping = ${sql.json(mapping)} WHERE id = ${id} AND tenant_id = ${t}`;
  return { counts, reasons, sample };
}

/**
 * Write the file. Batched, and each row ends with an outcome.
 *
 * Deliberately NOT one transaction for the whole file: a single failing row
 * would then undo four thousand good ones, and the point of the job is that a
 * partial run is visible and finishable rather than lost. Undo is the way back.
 */
export async function runImport(id: string, ctx: ActorCtx = {}): Promise<any> {
  const t = tid();
  const [job] = await sql`SELECT * FROM crm_import_jobs WHERE id = ${id} AND tenant_id = ${t} LIMIT 1`;
  if (!job) throw new Error('No such import');
  if (job.status === 'running') return jobShape(job);
  if (job.status === 'done' || job.status === 'reverted') throw new Error('This import has already run');
  const kind = job.kind as ImportKind;
  const mapping = job.mapping || {};

  await sql`UPDATE crm_import_jobs SET status = 'running', started_at = NOW(), error = NULL WHERE id = ${id} AND tenant_id = ${t}`;

  const onFile = await existingKeys(kind);
  const seen = new Set<string>();
  let added = 0, skipped = 0, failed = 0;

  try {
    // Only rows that have not been written yet, so a resumed job does not
    // create a second copy of everything it already saved.
    const pending = await sql`
      SELECT row_no, raw FROM crm_import_rows
       WHERE job_id = ${id} AND status IN ('pending', 'failed') ORDER BY row_no`;

    for (let i = 0; i < pending.length; i += BATCH) {
      const chunk = pending.slice(i, i + BATCH) as any[];
      const toWrite: { rowNo: number; record: any }[] = [];
      const outcomes: { rowNo: number; status: RowOutcome; reason: string | null; recordId: string | null }[] = [];

      for (const r of chunk) {
        const p = prepareRow(kind, r.raw, mapping);
        if (!p.ok) { outcomes.push({ rowNo: r.row_no, status: 'skipped', reason: p.reason || 'Unusable row', recordId: null }); skipped++; continue; }
        if (p.key && seen.has(p.key)) { outcomes.push({ rowNo: r.row_no, status: 'skipped', reason: 'Same unit earlier in this file', recordId: null }); skipped++; continue; }
        if (p.key && onFile.has(p.key)) { outcomes.push({ rowNo: r.row_no, status: 'skipped', reason: 'Already on file', recordId: null }); skipped++; continue; }
        if (p.key) seen.add(p.key);
        toWrite.push({ rowNo: r.row_no, record: { ...p.record, importBatchId: id } });
      }

      if (toWrite.length) {
        try {
          const saved = await writeRecords(kind, toWrite.map(w => w.record), ctx);
          toWrite.forEach((w, n) => {
            const rec = saved[n];
            if (rec?.id) { outcomes.push({ rowNo: w.rowNo, status: 'added', reason: null, recordId: rec.id }); added++; }
            else { outcomes.push({ rowNo: w.rowNo, status: 'failed', reason: 'The server did not save this row', recordId: null }); failed++; }
          });
        } catch (e: any) {
          // A FAILED BATCH IS RECORDED, NOT SWALLOWED. This is the case that
          // lost 2,700 rows in silence: every one of them now carries the
          // reason and can be run again.
          const why = String(e?.message || e).slice(0, 200);
          for (const w of toWrite) { outcomes.push({ rowNo: w.rowNo, status: 'failed', reason: why, recordId: null }); failed++; }
        }
      }

      await saveOutcomes(id, outcomes);
      await sql`UPDATE crm_import_jobs SET added = ${added}, skipped = ${skipped}, failed = ${failed} WHERE id = ${id} AND tenant_id = ${t}`;
    }

    await sql`UPDATE crm_import_jobs SET status = 'done', finished_at = NOW(), added = ${added}, skipped = ${skipped}, failed = ${failed} WHERE id = ${id} AND tenant_id = ${t}`;
  } catch (e: any) {
    await sql`UPDATE crm_import_jobs SET status = 'failed', finished_at = NOW(), error = ${String(e?.message || e).slice(0, 300)} WHERE id = ${id} AND tenant_id = ${t}`;
    throw e;
  }

  // ONE audit entry for the job, not one per row — a 1,380-row import wrote
  // 1,380 ledger entries and still could not say what the import did.
  audit({
    tenant_id: t, actor_type: ctx.actorType || 'user', actor_id: ctx.actorId ?? null,
    actor_label: ctx.actorLabel ?? null, action: 'import.run', target_type: 'import', target_id: id,
    summary: `Imported ${added} ${kind} from "${job.file_name || 'a spreadsheet'}" (${skipped} skipped, ${failed} failed)`,
    metadata: { kind, added, skipped, failed, total: job.total }, ip: ctx.ip, user_agent: ctx.userAgent,
  });

  return getImportJob(id);
}

async function writeRecords(kind: ImportKind, records: any[], ctx: ActorCtx): Promise<any[]> {
  if (kind === 'owners') return createOwnersBatch(records, ctx);
  // Leads and properties keep their single-record paths: each carries rules an
  // import must not skip (person resolution, routing, the property vocabulary),
  // and these files are tens of rows, not thousands. Written in parallel within
  // the batch, so a chunk is one wait rather than 500.
  const write = kind === 'clients' ? createLead : createProperty;
  const out = await Promise.allSettled(records.map(r => write(r, ctx)));
  return out.map(r => (r.status === 'fulfilled' ? r.value : null));
}

async function saveOutcomes(jobId: string, outcomes: { rowNo: number; status: RowOutcome; reason: string | null; recordId: string | null }[]): Promise<void> {
  if (!outcomes.length) return;
  // UPDATE, not an upsert: the rows are already there — the file was stored
  // before anything was written. An INSERT ... ON CONFLICT had to supply `raw`
  // as well, and omitting it failed the whole batch on a NOT NULL constraint
  // AFTER 500 owners had been created, which is the worst possible moment.
  // One statement for the batch, matched up by row number.
  await sql`
    UPDATE crm_import_rows AS r
       SET status = d.status, reason = d.reason, record_id = d.record_id
      FROM (SELECT * FROM unnest(
             ${sql.array(outcomes.map(o => o.rowNo))}::int[],
             ${sql.array(outcomes.map(o => String(o.status)))}::text[],
             ${sql.array(outcomes.map(o => o.reason ?? null)) as any}::text[],
             ${sql.array(outcomes.map(o => o.recordId ?? null)) as any}::text[]
           ) AS t(row_no, status, reason, record_id)) AS d
     WHERE r.job_id = ${jobId} AND r.row_no = d.row_no`;
}

/** Every row that did not become a record, with its reason — what the person
 *  downloads, fixes and re-imports. */
export async function importRows(id: string, status?: string): Promise<any[]> {
  const t = tid();
  const [job] = await sql`SELECT id FROM crm_import_jobs WHERE id = ${id} AND tenant_id = ${t} LIMIT 1`;
  if (!job) return [];
  const rows = status
    ? await sql`SELECT row_no, raw, status, reason, record_id FROM crm_import_rows WHERE job_id = ${id} AND status = ${status} ORDER BY row_no`
    : await sql`SELECT row_no, raw, status, reason, record_id FROM crm_import_rows WHERE job_id = ${id} ORDER BY row_no`;
  return (rows as any[]).map(r => ({ rowNo: r.row_no, raw: r.raw, status: r.status, reason: r.reason, recordId: r.record_id }));
}

/**
 * Undo — delete what this job created, and say how many.
 *
 * Scoped by tenant and by batch id, and it deletes only rows this job wrote
 * (record ids it recorded), so an owner edited since is still that owner's row
 * and nothing outside the batch can be caught by it.
 */
export async function revertImport(id: string, ctx: ActorCtx = {}): Promise<{ deleted: number }> {
  const t = tid();
  const [job] = await sql`SELECT * FROM crm_import_jobs WHERE id = ${id} AND tenant_id = ${t} LIMIT 1`;
  if (!job) throw new Error('No such import');
  if (job.reverted_at) return { deleted: 0 };
  const table = job.kind === 'owners' ? sql`crm_owners` : job.kind === 'clients' ? sql`crm_leads` : sql`crm_properties`;
  const gone = await sql`DELETE FROM ${table} WHERE tenant_id = ${t} AND import_batch_id = ${id} RETURNING id`;
  await sql`UPDATE crm_import_jobs SET status = 'reverted', reverted_at = NOW(), reverted_by = ${ctx.actorId ?? null} WHERE id = ${id} AND tenant_id = ${t}`;
  audit({
    tenant_id: t, actor_type: ctx.actorType || 'user', actor_id: ctx.actorId ?? null,
    actor_label: ctx.actorLabel ?? null, action: 'import.revert', target_type: 'import', target_id: id,
    summary: `Undid the import of "${job.file_name || 'a spreadsheet'}" — ${gone.length} ${job.kind} removed`,
    metadata: { kind: job.kind, deleted: gone.length }, ip: ctx.ip, user_agent: ctx.userAgent,
  });
  return { deleted: gone.length };
}

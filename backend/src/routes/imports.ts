/**
 * ============================================================================
 * 📥 IMPORTS — upload a sheet, check it, run it, undo it
 * ============================================================================
 * The browser used to save an import itself, one HTTP request per row. See
 * services/imports.ts for what that cost. These routes exist so the file is
 * uploaded once and the WRITING happens here, where a partial run is visible
 * and a failure has a reason.
 *
 * The shape of a run:
 *   POST   /imports                 create the job (kind, headers, file name)
 *   POST   /imports/:id/rows        the file's rows, in chunks
 *   POST   /imports/:id/preview     what this mapping would do, over every row
 *   POST   /imports/:id/run         start writing; returns immediately
 *   GET    /imports/:id             progress, and the final counts
 *   GET    /imports/:id/rows        every row's outcome (?status=skipped)
 *   POST   /imports/:id/revert      undo
 *
 * Importing creates records for the whole firm, so it is owner/manager work —
 * the same gate reassignment and settings use. An agent has no import screen.
 * ============================================================================
 */
import { Router, Request, Response } from 'express';
import { requireTenantAuth } from '../middleware/auth';
import { getContext } from '../services/context';
import {
  createImportJob, appendImportRows, previewImport, runImport,
  getImportJob, listImportJobs, importRows, revertImport, type ImportKind,
} from '../services/imports';

export const importsRouter = Router();
importsRouter.use(requireTenantAuth);

const KINDS: ImportKind[] = ['owners', 'clients', 'properties'];

/** Who may import. Checked on the SERVER, not only by hiding a button: the
 *  previous import ran off routes an agent could call directly. */
function mayImport(res: Response): boolean {
  const role = getContext()?.role;
  if (role === 'owner' || role === 'admin' || role === 'manager') return true;
  res.status(403).json({ error: 'forbidden', message: 'Only an owner or manager can import records.' });
  return false;
}

const actor = (req: Request) => ({
  actorType: 'user' as const, actorId: req.user?.id ?? null, actorLabel: (req.user as any)?.name ?? null,
  ip: req.ip, userAgent: req.get('user-agent') ?? undefined,
});

importsRouter.get('/', async (req: Request, res: Response) => {
  try {
    if (!mayImport(res)) return;
    return res.json({ success: true, imports: await listImportJobs(Number(req.query.limit) || 20) });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to list imports', message: err.message });
  }
});

importsRouter.post('/', async (req: Request, res: Response) => {
  try {
    if (!mayImport(res)) return;
    const kind = String(req.body?.kind || '') as ImportKind;
    if (!KINDS.includes(kind)) return res.status(400).json({ error: 'Unknown import type' });
    const headers = Array.isArray(req.body?.headers) ? req.body.headers.map(String) : [];
    if (!headers.length) return res.status(400).json({ error: 'That sheet has no header row.' });
    const job = await createImportJob({
      kind, headers,
      fileName: req.body?.fileName ? String(req.body.fileName) : undefined,
      sheetName: req.body?.sheetName ? String(req.body.sheetName) : undefined,
      sheetNames: Array.isArray(req.body?.sheetNames) ? req.body.sheetNames.map(String) : [],
      mapping: req.body?.mapping && typeof req.body.mapping === 'object' ? req.body.mapping : {},
      rows: Array.isArray(req.body?.rows) ? req.body.rows : [],
    }, actor(req));
    return res.status(201).json({ success: true, import: job });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to start the import', message: err.message });
  }
});

/** The rows, in chunks — a 4,000-row sheet is a few megabytes and does not have
 *  to arrive in one body. */
importsRouter.post('/:id/rows', async (req: Request, res: Response) => {
  try {
    if (!mayImport(res)) return;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows) return res.status(400).json({ error: 'rows must be an array' });
    const total = await appendImportRows(req.params.id, rows);
    return res.json({ success: true, total });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to store the rows', message: err.message });
  }
});

importsRouter.post('/:id/preview', async (req: Request, res: Response) => {
  try {
    if (!mayImport(res)) return;
    // `project` is typed once for the whole file and used wherever a row has
    // none of its own — see prepareRow.
    const out = await previewImport(req.params.id, req.body?.mapping || {}, {
      project: req.body?.project ? String(req.body.project).trim() : null,
    });
    if (!out) return res.status(404).json({ error: 'No such import' });
    return res.json({ success: true, ...out });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to check the file', message: err.message });
  }
});

/**
 * Start the run and answer straight away.
 *
 * Four thousand rows outlive an HTTP request — and a request that times out
 * mid-import is how the browser lost track of what had been saved. The job
 * reports its own progress, so the screen polls rather than waits, and closing
 * the laptop no longer stops anything.
 */
importsRouter.post('/:id/run', async (req: Request, res: Response) => {
  try {
    if (!mayImport(res)) return;
    const job = await getImportJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'No such import' });
    if (job.status === 'running') return res.json({ success: true, import: job });
    // Not awaited on purpose (see above). The request context propagates into
    // it, so the tenant and the actor are the caller's.
    runImport(req.params.id, actor(req)).catch(err => console.warn('[Import] run failed:', err?.message));
    return res.json({ success: true, import: { ...job, status: 'running' } });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to run the import', message: err.message });
  }
});

importsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    if (!mayImport(res)) return;
    const job = await getImportJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'No such import' });
    return res.json({ success: true, import: job });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to read the import', message: err.message });
  }
});

importsRouter.get('/:id/rows', async (req: Request, res: Response) => {
  try {
    if (!mayImport(res)) return;
    const status = req.query.status ? String(req.query.status) : undefined;
    return res.json({ success: true, rows: await importRows(req.params.id, status) });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to read the rows', message: err.message });
  }
});

importsRouter.post('/:id/revert', async (req: Request, res: Response) => {
  try {
    if (!mayImport(res)) return;
    const out = await revertImport(req.params.id, actor(req));
    return res.json({ success: true, ...out, import: await getImportJob(req.params.id) });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to undo the import', message: err.message });
  }
});

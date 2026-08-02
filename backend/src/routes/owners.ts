/**
 * ============================================================================
 * 📞 CODED DOMAIN ROUTER: OWNERS (cold-calling list, supply-side outreach)
 * ============================================================================
 * Property owners a firm calls to ask if they want to sell/rent. Its own
 * table and its own small status set — see the OWNERS block in store.ts for
 * why this is not a crm_leads row.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import { requireTenantAuth } from '../middleware/auth';
import {
  createOwner, listOwners, getOwnersSummary, listOwnerProjects,
  getOwnerById, updateOwner, deleteOwner, bulkAssignOwners, OWNER_STATUSES,
} from '../services/store';

export const ownersRouter = Router();
ownersRouter.use(requireTenantAuth);

/** GET /api/v1/owners?page=&limit=&q=&stage=&project=&agentId=&sortKey=&sortDir= */
ownersRouter.get('/', async (req: Request, res: Response) => {
  try {
    const q = req.query;
    const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const { rows, total, page, limit } = await listOwners({
      page: Number(q.page) || 1, limit: Number(q.limit) || 50,
      q: str(q.q), stage: str(q.stage), project: str(q.project), agentId: str(q.agentId),
      locality: str(q.locality), agent: str(q.agent), source: str(q.source),
      sortKey: str(q.sortKey), sortDir: str(q.sortDir),
    });
    return res.status(200).json({
      success: true, data: rows, total, page, limit,
      pages: Math.max(1, Math.ceil(total / limit)), count: rows.length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch owners', message: err.message });
  }
});

/** GET /api/v1/owners/summary — counts for the segment pills. Before /:id. */
ownersRouter.get('/summary', async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({ success: true, summary: { ...(await getOwnersSummary()), statuses: OWNER_STATUSES } });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to summarise owners', message: err.message });
  }
});

/** GET /api/v1/owners/projects — grouped-by-project counts. Before /:id. */
ownersRouter.get('/projects', async (_req: Request, res: Response) => {
  try {
    const { rows, total } = await listOwnerProjects();
    return res.status(200).json({ success: true, data: rows, total });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to list owner projects', message: err.message });
  }
});

/** POST /api/v1/owners/bulk-assign  body { ids: string[], agentId: string|null } */
ownersRouter.post('/bulk-assign', async (req: Request, res: Response) => {
  try {
    const { ids, agentId } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids[] is required' });
    const n = await bulkAssignOwners(ids, agentId || null, {
      actorType: 'user', actorId: req.user?.id ?? null, actorLabel: req.user?.name ?? null,
      ip: req.ip, userAgent: req.get('user-agent') ?? undefined,
    });
    return res.status(200).json({ success: true, updated: n });
  } catch (err: any) {
    if (err?.status === 403) return res.status(403).json({ success: false, error: 'Forbidden', message: err.message });
    return res.status(500).json({ error: 'Bulk assign failed', message: err.message });
  }
});

ownersRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const owner = await getOwnerById(req.params.id);
    if (!owner) return res.status(404).json({ success: false, error: 'Not found' });
    return res.status(200).json({ success: true, owner });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch owner', message: err.message });
  }
});

ownersRouter.post('/', async (req: Request, res: Response) => {
  try {
    const created = await createOwner(req.body || {}, {
      actorType: 'user', actorId: req.user?.id ?? null, actorLabel: req.user?.name ?? null,
      ip: req.ip, userAgent: req.get('user-agent') ?? undefined,
    });
    return res.status(201).json({ success: true, owner: created });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create owner', message: err.message });
  }
});

ownersRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const updated = await updateOwner(req.params.id, req.body || {}, {
      actorType: 'user', actorId: req.user?.id ?? null, actorLabel: req.user?.name ?? null,
      ip: req.ip, userAgent: req.get('user-agent') ?? undefined,
    });
    if (!updated) return res.status(404).json({ success: false, error: 'Not found' });
    return res.status(200).json({ success: true, owner: updated });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update owner', message: err.message });
  }
});

ownersRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const ok = await deleteOwner(req.params.id, {
      actorType: 'user', actorId: req.user?.id ?? null, actorLabel: req.user?.name ?? null,
      ip: req.ip, userAgent: req.get('user-agent') ?? undefined,
    });
    if (!ok) return res.status(404).json({ success: false, error: 'Not found' });
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete owner', message: err.message });
  }
});

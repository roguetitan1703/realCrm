/**
 * Agreements — what a closed deal is. services/agreements.ts says why.
 *
 *   GET    /agreements?kind=&status=&leadId=&propertyId=&ownerId=&q=&page=
 *   GET    /agreements/:id
 *   POST   /agreements                close the deal (leadId) or record one
 *   PATCH  /agreements/:id            correct amount, dates, file, notes
 *   POST   /agreements/:id/renew      a new term; the old one is kept
 *   POST   /agreements/:id/end        moved out / sold on; the flat frees up
 *
 * Who may write: the owner and managers, and an agent on a record they hold.
 * A refusal is 422, not 403: the client reads any 403 as a dead session and
 * signs the person out (api.js noteSessionExpired).
 */
import { Router, Request, Response } from 'express';
import { requireTenantAuth } from '../middleware/auth';
import { getContext } from '../services/context';
import { sql } from '../services/db';
import {
  listAgreements, getAgreement, createAgreement, updateAgreement, renewAgreement, endAgreement, AgreementError,
} from '../services/agreements';

export const agreementsRouter = Router();
agreementsRouter.use(requireTenantAuth);

const ctxOf = (req: Request) => ({
  actorType: 'user' as const, actorId: req.user?.id ?? null, actorLabel: req.user?.name ?? null,
  ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null,
});
const isDesk = () => ['owner', 'manager', 'admin', 'superadmin'].includes(String(getContext()?.role || ''));

/** An agent writes on what they hold; the desk writes on anything. */
export async function holds(table: 'crm_leads' | 'crm_owners', id: string | null | undefined): Promise<boolean> {
  if (isDesk()) return true;
  if (!id) return false;
  const c = getContext();
  const [r] = await sql`SELECT agent_id FROM ${sql(table)} WHERE tenant_id = ${c!.tenantId} AND id = ${id}`;
  return !!r && r.agent_id === c!.userId;
}

export function sendError(res: Response, err: any) {
  if (err instanceof AgreementError) {
    return res.status(err.status).json({ error: err.message, message: err.message, existingId: err.existingId });
  }
  return res.status(500).json({ error: 'Could not save', message: err?.message });
}

agreementsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const q = req.query as any;
    res.json(await listAgreements({ kind: q.kind, status: q.status, leadId: q.leadId, propertyId: q.propertyId, ownerId: q.ownerId, q: q.q, page: q.page, limit: q.limit }));
  } catch (err) { sendError(res, err); }
});

agreementsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const a = await getAgreement(req.params.id);
    if (!a) return res.status(404).json({ error: 'Not found' });
    res.json({ agreement: a });
  } catch (err) { sendError(res, err); }
});

agreementsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    if (body.leadId ? !(await holds('crm_leads', body.leadId)) : !isDesk()) {
      return res.status(422).json({ error: 'Only the person on this lead, or a manager, can close it.' });
    }
    res.status(201).json({ agreement: await createAgreement(body, ctxOf(req)) });
  } catch (err) { sendError(res, err); }
});

/** The agreement's lead decides who may touch it, as it did who could close it. */
async function mayEdit(id: string) {
  const a = await getAgreement(id);
  if (!a) return { a: null, ok: false };
  return { a, ok: isDesk() || (a.leadId ? await holds('crm_leads', a.leadId) : false) };
}

agreementsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { a, ok } = await mayEdit(req.params.id);
    if (!a) return res.status(404).json({ error: 'Not found' });
    if (!ok) return res.status(422).json({ error: 'Only the person on this deal, or a manager, can change it.' });
    res.json({ agreement: await updateAgreement(req.params.id, req.body || {}, ctxOf(req)) });
  } catch (err) { sendError(res, err); }
});

agreementsRouter.post('/:id/renew', async (req: Request, res: Response) => {
  try {
    const { a, ok } = await mayEdit(req.params.id);
    if (!a) return res.status(404).json({ error: 'Not found' });
    if (!ok) return res.status(422).json({ error: 'Only the person on this deal, or a manager, can renew it.' });
    res.status(201).json({ agreement: await renewAgreement(req.params.id, req.body || {}, ctxOf(req)) });
  } catch (err) { sendError(res, err); }
});

agreementsRouter.post('/:id/end', async (req: Request, res: Response) => {
  try {
    const { a, ok } = await mayEdit(req.params.id);
    if (!a) return res.status(404).json({ error: 'Not found' });
    if (!ok) return res.status(422).json({ error: 'Only the person on this deal, or a manager, can end it.' });
    res.json({ agreement: await endAgreement(req.params.id, ctxOf(req)) });
  } catch (err) { sendError(res, err); }
});

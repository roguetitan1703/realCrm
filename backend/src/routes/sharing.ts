/**
 * SENDING FLATS, signed in (docs/specs/listing-pages.md §A.5).
 *
 *   POST /api/v1/share-links                {leadId? | newPerson{name,phone}, propertyIds, showPrice?}
 *   GET  /api/v1/share-links/mine           ?page=&limit=
 *   POST /api/v1/share-links/:id/off
 *   POST /api/v1/share-links/:id/attach     {leadId}
 *   POST /api/v1/share-taps/:code/lead      {phone, name?} | {leadId}
 *
 * Also, in their own routers: GET /leads/:id/shares (routes/leads.ts),
 * POST /properties/catalogue (routes/properties.ts), PATCH /auth/me (routes/auth.ts).
 * services/sharing.ts holds the rules; this file only maps them to statuses.
 * Two routers, each mounted on its own prefix: a router mounted on /api/v1
 * would put its sign-in gate in front of every route after it.
 */
import { Router, Request, Response } from 'express';
import { requireTenantAuth } from '../middleware/auth';
import { createShareLink, myLinks, turnOff, attachLink, tapToLead, ShareError } from '../services/sharing';

export const shareLinksRouter = Router();
export const shareTapsRouter = Router();
shareLinksRouter.use(requireTenantAuth);
shareTapsRouter.use(requireTenantAuth);

export function shareFail(res: Response, err: any) {
  if (err instanceof ShareError) return res.status(err.status).json({ success: false, error: err.code, message: err.message, ...err.extra });
  console.error('[Share] failed:', err?.message || err);
  return res.status(500).json({ success: false, error: 'failed', message: err?.message || 'Something went wrong.' });
}

const origin = (req: Request) => (req.headers.origin as string) || null;

shareLinksRouter.post('/', async (req: Request, res: Response) => {
  try { return res.status(201).json({ success: true, ...(await createShareLink(req.body || {}, origin(req))) }); }
  catch (err) { return shareFail(res, err); }
});

shareLinksRouter.get('/mine', async (req: Request, res: Response) => {
  try { return res.json({ success: true, ...(await myLinks({ page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 30 }, origin(req))) }); }
  catch (err) { return shareFail(res, err); }
});

shareLinksRouter.post('/:id/off', async (req: Request, res: Response) => {
  try { return res.json({ success: true, ...(await turnOff(String(req.params.id))) }); }
  catch (err) { return shareFail(res, err); }
});

shareLinksRouter.post('/:id/attach', async (req: Request, res: Response) => {
  try { return res.json({ success: true, ...(await attachLink(String(req.params.id), String(req.body?.leadId || ''))) }); }
  catch (err) { return shareFail(res, err); }
});

shareTapsRouter.post('/:code/lead', async (req: Request, res: Response) => {
  try { return res.json({ success: true, ...(await tapToLead(String(req.params.code), req.body || {})) }); }
  catch (err) { return shareFail(res, err); }
});

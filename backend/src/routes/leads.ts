/**
 * ============================================================================
 * 👥 CODED DOMAIN ROUTER: LEADS MODULE WORKFLOWS & ACTIONS
 * ============================================================================
 * Where does module-specific code live? RIGHT HERE IN TYPESCRIPT!
 * While the data storage is composable (`module_records`), complex business
 * logic like Exotel telephony bridges, WhatsApp template dispatches, calendar
 * visit scheduling, and round-robin math are explicitly coded in TypeScript.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import { requireTenantAuth } from '../middleware/auth';
import { getLeads, createLead, getLeadById, listLeads, getLeadsSummary, getLeadCandidates, bulkAssignLeads, bulkDeleteLeads, splitAssign } from '../services/store';
import { notWorkableBody } from '../services/workforce';
import { phoneInvalidBody } from '../services/phone';
import { leadShares } from '../services/sharing';
import { shareFail } from './sharing';

export const leadsRouter = Router();
leadsRouter.use(requireTenantAuth);

/**
 * GET /api/v1/leads
 */
leadsRouter.get('/', async (req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    data: await getLeads(),
  });
});

/**
 * POST /api/v1/leads
 */
/**
 * ONE PAGE OF LEADS
 * GET /api/v1/leads/page?page=&limit=&q=&stage=&segment=&agentId=
 * A separate path from GET / so the existing unpaged route keeps working for
 * callers not yet migrated. An agent's scope is applied here, not in the
 * browser — a filter the client applies is not a permission.
 */
leadsRouter.get('/page', async (req: Request, res: Response) => {
  try {
    const q = req.query;
    const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    // No scope argument: listLeads reads the agent's scope from the request
    // context itself, so it cannot be forgotten by a caller. It was forgotten
    // here — `req.user.userId` is undefined (the field is `id`).
    const { rows, total, page, limit } = await listLeads({
      page: Number(q.page) || 1, limit: Number(q.limit) || 50,
      q: str(q.q), stage: str(q.stage), agentId: str(q.agentId),
      segment: str(q.segment), intent: str(q.intent),
      // The filter panel's fields, forwarded rather than dropped.
      source: str(q.source), locality: str(q.locality), agent: str(q.agent), flag: str(q.flag),
      alert: str(q.alert),
      sortKey: str(q.sortKey), sortDir: str(q.sortDir),
    });
    return res.status(200).json({
      success: true, data: rows, total, page, limit,
      pages: Math.max(1, Math.ceil(total / limit)), count: rows.length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch leads', message: err.message });
  }
});

/**
 * GET /api/v1/leads/summary — every count beside the list, under the same
 * filters the list is under.
 *
 * It takes the SAME query parameters as /page and forwards all of them. It used
 * to take none, so picking an agent moved the rows and left every number
 * describing the whole desk.
 */
leadsRouter.get('/summary', async (req: Request, res: Response) => {
  try {
    const q = req.query;
    const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const summary = await getLeadsSummary({
      q: str(q.q), stage: str(q.stage), agentId: str(q.agentId),
      segment: str(q.segment), intent: str(q.intent),
      source: str(q.source), locality: str(q.locality), agent: str(q.agent), flag: str(q.flag),
      alert: str(q.alert),
    });
    return res.status(200).json({ success: true, summary });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to summarise leads', message: err.message });
  }
});

/**
 * ASSIGN MANY LEADS AT ONCE
 * POST /api/v1/leads/bulk-assign  { ids: [...], agentId: string|null }
 *   or { ids: [...], agentIds: [a, b] } — split between them, one each in turn
 *   (see splitAssign). Handing a selection to one person was the only option,
 *   so sharing fifty leads between three callers meant three passes of ticking.
 * Declared before /:id so "bulk-assign" is not read as a lead id.
 */
leadsRouter.post('/bulk-assign', async (req: Request, res: Response) => {
  try {
    const { ids, agentId, agentIds } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Pick at least one lead.' });
    }
    const ctx = {
      actorType: 'user' as const, actorId: req.user?.id ?? null, actorLabel: null,
      ip: req.ip || req.socket?.remoteAddress || null, userAgent: (req.headers['user-agent'] as string) || null,
    };
    if (Array.isArray(agentIds) && agentIds.length > 1) {
      const out = await splitAssign('leads', ids, agentIds.map(String), ctx);
      return res.status(200).json({ success: true, assigned: out.assigned, perTarget: out.perTarget });
    }
    const one = Array.isArray(agentIds) && agentIds.length === 1 ? String(agentIds[0]) : (agentId ?? null);
    const assigned = await bulkAssignLeads(ids, one, ctx);
    return res.status(200).json({ success: true, assigned });
  } catch (err: any) {
    const nw = notWorkableBody(err) || phoneInvalidBody(err); if (nw) return res.status(422).json(nw);
    if (err?.status === 403) {
      return res.status(403).json({ success: false, error: 'Forbidden', message: err.message, code: err.code });
    }
    return res.status(500).json({ success: false, error: 'Bulk assign failed', message: err.message });
  }
});

/**
 * POST /api/v1/leads/bulk-delete  { ids: [...] }
 * Declared before /:id, same as bulk-assign, so the word is not read as an id.
 * Per-record permission is enforced in the service for every id — this route
 * does not pre-authorise the whole batch.
 */
leadsRouter.post('/bulk-delete', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Pick at least one lead.' });
    }
    const { deleted, skipped } = await bulkDeleteLeads(ids, {
      actorType: 'user', actorId: req.user?.id ?? null, actorLabel: req.user?.name ?? null,
      ip: req.ip || req.socket?.remoteAddress || null, userAgent: (req.headers['user-agent'] as string) || null,
    });
    return res.status(200).json({ success: true, deleted, skipped });
  } catch (err: any) {
    if (err?.status === 403) {
      return res.status(403).json({ success: false, error: 'Forbidden', message: err.message, code: err.code });
    }
    return res.status(500).json({ success: false, error: 'Bulk delete failed', message: err.message });
  }
});

/**
 * GET /api/v1/leads/:id/matches
 * Candidate listings for this lead's requirement. The client scores them with
 * matching.js exactly as before — this only replaces "run it over every
 * property in the firm" with "run it over the ones that could possibly match".
 */
leadsRouter.get('/:id/matches', async (req: Request, res: Response) => {
  try {
    return res.status(200).json({ success: true, data: await getLeadCandidates(req.params.id) });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch matches', message: err.message });
  }
});

/**
 * WHAT THIS LEAD WAS SENT, AND WHAT THEY DID WITH IT
 * GET /api/v1/leads/:id/shares — per flat: sent at, opens, last opened,
 * interested taps, devices, the latest link (listing-pages.md §A.5).
 */
leadsRouter.get('/:id/shares', async (req: Request, res: Response) => {
  try { return res.status(200).json({ success: true, ...(await leadShares(req.params.id, (req.headers.origin as string) || null)) }); }
  catch (err) { return shareFail(res, err); }
});

/**
 * ONE LEAD, IN FULL
 * GET /api/v1/leads/:id
 * The detail screen's own read, so opening a lead no longer requires the whole
 * collection to be sitting in the browser. Declared before the /:id/actions/*
 * routes it shares a prefix with.
 */
leadsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: 'Not found' });
    return res.status(200).json({ success: true, lead });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch lead', message: err.message });
  }
});

leadsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const newLead = await createLead(req.body, {
      actorType: 'user', actorId: req.user?.id ?? null, actorLabel: req.user?.name ?? null,
      ip: req.ip || req.socket?.remoteAddress || null, userAgent: (req.headers['user-agent'] as string) || null,
    });
    return res.status(201).json({ success: true, data: newLead });
  } catch (err: any) {
    const nw = notWorkableBody(err) || phoneInvalidBody(err); if (nw) return res.status(422).json(nw);
    if (err?.status === 403) {
      return res.status(403).json({ success: false, error: 'Forbidden', message: err.message, code: err.code });
    }
    throw err;
  }
});

/**
 * A second copy of the fabricated telephony bridge lived here — same invented
 * DID, same "Cloud telephony call bridge initiated" response, writing
 * "Outbound telephony call to buyer <number> via DID 08045678900" straight
 * into crm_timeline_events. Two routes inventing the same call.
 *
 * Removed. A call is recorded through /records/:id/actions/contact-log, which
 * says only that a call was logged, by whom, and with what outcome.
 */

/**
 * Three more routes lived here — /:id/actions/whatsapp, /schedule-visit and
 * /convert-to-client — that nothing in the app called. Each wrote straight to
 * crm_leads or the timeline past updateLead(), so none checked the lead was
 * the caller's and none was audited; schedule-visit took its author from the
 * request body, and whatsapp recorded "sent via Meta Cloud API" for a message
 * nobody sent. Removed.
 */

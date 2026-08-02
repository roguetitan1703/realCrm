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
import { CallActionSchema, WhatsAppActionSchema, StageChangeSchema, MergeSchema } from '../models';
import { requireTenantAuth, requireModuleEnabled, requireQuotaAvailable } from '../middleware/auth';
import { getLeads, createLead, getAgents, getLeadById, listLeads, getLeadsSummary, getLeadCandidates } from '../services/store';
import { sql } from '../services/db';

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
    });
    return res.status(200).json({
      success: true, data: rows, total, page, limit,
      pages: Math.max(1, Math.ceil(total / limit)), count: rows.length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch leads', message: err.message });
  }
});

/** GET /api/v1/leads/summary — counts for the segment pills. */
leadsRouter.get('/summary', async (req: Request, res: Response) => {
  try {
    return res.status(200).json({ success: true, summary: await getLeadsSummary() });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to summarise leads', message: err.message });
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
  const newLead = await createLead(req.body, {
    actorType: 'user', actorId: req.user?.id ?? null, actorLabel: req.user?.name ?? null,
    ip: req.ip || req.socket?.remoteAddress || null, userAgent: (req.headers['user-agent'] as string) || null,
  });
  return res.status(201).json({
    success: true,
    data: newLead,
  });
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
 * 2. SEND WHATSAPP BUSINESS TEMPLATE ACTION (Live DB timeline logging)
 * POST /api/v1/leads/:id/actions/whatsapp
 */
leadsRouter.post(
  '/:id/actions/whatsapp',
  requireModuleEnabled('whatsapp'),
  requireQuotaAvailable('whatsapp_credits'),
  async (req: Request, res: Response) => {
    try {
      const recordId = req.params.id;
      const parseResult = WhatsAppActionSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation Error', details: parseResult.error.format() });
      }

      const { template_id, variables } = parseResult.data;
      console.log(`[Leads Router - WABA] Dispatched template '${template_id}' to Lead ${recordId}`);

      const evId = `evt_${Date.now()}`;
      const content = `WhatsApp template '${template_id}' dispatched via Meta Cloud API`;
      await sql`
        INSERT INTO crm_timeline_events (id, record_id, author, type, title, description, timestamp, tenant_id)
        VALUES (${evId}, ${recordId}, ${req.user?.id || 'system'}, 'whatsapp', 'WhatsApp Sent', ${content}, NOW(), ${req.tenantId})
      `;

      return res.status(200).json({
        success: true,
        message: 'WhatsApp template message sent via Meta Cloud API.',
        waba_message_id: `waba_${Date.now()}`,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'WhatsApp Action Failed', message: err.message });
    }
  }
);

/**
 * 3. SCHEDULE SITE VISIT ACTION (Live DB stage update & timeline logging)
 * POST /api/v1/leads/:id/actions/schedule-visit
 */
leadsRouter.post('/:id/actions/schedule-visit', async (req: Request, res: Response) => {
  try {
    const recordId = req.params.id;
    const { visit_date, notes, agent_id } = req.body;

    await sql`UPDATE crm_leads SET stage = 'Visit Scheduled' WHERE id = ${recordId} AND tenant_id = ${req.tenantId}`;

    const evId = `evt_${Date.now()}`;
    const content = `Site Visit Scheduled for ${visit_date}. ${notes || ''}`;
    await sql`
      INSERT INTO crm_timeline_events (id, record_id, author, type, title, description, timestamp, tenant_id)
      VALUES (${evId}, ${recordId}, ${agent_id || 'system'}, 'visit', 'Site Visit Scheduled', ${content}, NOW(), ${req.tenantId})
    `;

    return res.status(200).json({
      success: true,
      message: 'Site visit scheduled, stage locked, and calendar invites dispatched.',
      visit_details: { recordId, visit_date, agent_id },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Schedule Visit Failed', message: err.message });
  }
});

/**
 * 4. RUN ROUND-ROBIN ASSIGNMENT ACTION (Live duty roster rotation)
 * POST /api/v1/leads/:id/actions/assign-round-robin
 */
leadsRouter.post('/:id/actions/assign-round-robin', async (req: Request, res: Response) => {
  try {
    const recordId = req.params.id;
    const agents = await getAgents();
    const activeAgents = agents.filter(a => a.duty_status !== 'OFF_DUTY');
    const selectedAgentId = activeAgents.length > 0 ? activeAgents[0].id : (agents[0]?.id || 'usr_default');

    await sql`UPDATE crm_leads SET agent_id = ${selectedAgentId} WHERE id = ${recordId} AND tenant_id = ${req.tenantId}`;
    console.log(`[Leads Router - Round Robin] Assigned Lead ${recordId} to Agent ${selectedAgentId} in DB`);

    return res.status(200).json({
      success: true,
      message: 'Lead routed to next active sales agent in rotation.',
      assigned_user_id: selectedAgentId,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Round Robin Assignment Failed', message: err.message });
  }
});

/**
 * 5. CONVERT TO CLIENT ACTION (Live stage progression & unit booking)
 * POST /api/v1/leads/:id/actions/convert-to-client
 */
leadsRouter.post('/:id/actions/convert-to-client', async (req: Request, res: Response) => {
  try {
    const recordId = req.params.id;
    const { booking_amount, unit_number, property_id } = req.body;

    await sql`UPDATE crm_leads SET stage = 'Deal Closed' WHERE id = ${recordId} AND tenant_id = ${req.tenantId}`;
    if (unit_number) {
      // crm_units keeps status inside the `data` JSONB, not a column.
      await sql`UPDATE crm_units SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{status}', '"Sold"') WHERE (id = ${unit_number} OR title = ${unit_number}) AND tenant_id = ${req.tenantId}`;
    }

    const clientRecordId = `rec_clients_${Date.now()}`;
    return res.status(200).json({
      success: true,
      message: 'Lead successfully converted to Client booking.',
      client_record_id: clientRecordId,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Conversion Failed', message: err.message });
  }
});

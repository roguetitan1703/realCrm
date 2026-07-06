/**
 * ============================================================================
 * ⚡ ACTION-ORIENTED REST API ROUTES
 * ============================================================================
 * Handles domain workflows: Click-to-Call bridges, WhatsApp template dispatches,
 * atomic stage changes with notes, and lead merging.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import {
  CallActionSchema,
  WhatsAppActionSchema,
  StageChangeSchema,
  MergeSchema,
} from '../models';
import {
  requireTenantAuth,
  requireModuleEnabled,
  requireQuotaAvailable,
} from '../middleware/auth';

export const actionsRouter = Router();

// Apply mandatory tenant authentication to all action endpoints
actionsRouter.use(requireTenantAuth);

/**
 * 1. CLICK-TO-CALL TELEPHONY BRIDGE
 * POST /api/v1/leads/:id/actions/call
 * 
 * Flow:
 * 1. Validates Zod payload and checks 'dialer' module entitlement + call minutes quota.
 * 2. Looks up Leg 1 (Agent Phone) and Leg 2 (Buyer Phone) from DB.
 * 3. Calls Exotel 2-leg bridge API.
 * 4. Logs timeline event and returns call session ID.
 */
actionsRouter.post(
  '/:id/actions/call',
  requireModuleEnabled('dialer'),
  requireQuotaAvailable('call_minutes'),
  async (req: Request, res: Response) => {
    try {
      const leadId = req.params.id;
      const parseResult = CallActionSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation Error', details: parseResult.error.format() });
      }

      const { agent_id } = parseResult.data;
      const tenant = req.tenant!;

      // In production: Lookup actual phone numbers from RLS DB
      const leg1AgentPhone = req.user?.phone_number || '+919820011223';
      const leg2BuyerPhone = '+919876543210'; // Mocked lead phone
      const virtualLandlineDid = '08045678900';

      console.log(`[Exotel Bridge] Tenant: ${tenant.name} | Dialing Leg 1: ${leg1AgentPhone} -> Leg 2: ${leg2BuyerPhone} via DID ${virtualLandlineDid}`);

      // Mock Exotel API response payload
      const mockCallSid = `call_exo_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // In production: INSERT INTO timeline_events (tenant_id, lead_id, event_type, content, metadata)
      const mockTimelineEntry = {
        id: `ev_${Date.now()}`,
        tenant_id: tenant.id,
        lead_id: leadId,
        user_id: agent_id,
        event_type: 'call',
        content: `Initiated outbound cloud telephony call via virtual number ${virtualLandlineDid}`,
        metadata: { call_sid: mockCallSid, status: 'initiated', leg1: leg1AgentPhone },
        created_at: new Date(),
      };

      return res.status(200).json({
        success: true,
        message: 'Cloud telephony call bridge initiated. Leg 1 (Agent phone) will ring in 2 seconds.',
        call_sid: mockCallSid,
        timeline_event: mockTimelineEntry,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Telephony Bridge Failed', message: err.message });
    }
  }
);

/**
 * 2. OUTBOUND WHATSAPP BUSINESS (WABA) DISPATCH
 * POST /api/v1/leads/:id/actions/whatsapp
 */
actionsRouter.post(
  '/:id/actions/whatsapp',
  requireModuleEnabled('whatsapp'),
  requireQuotaAvailable('whatsapp_credits'),
  async (req: Request, res: Response) => {
    try {
      const leadId = req.params.id;
      const parseResult = WhatsAppActionSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation Error', details: parseResult.error.format() });
      }

      const { template_id, variables } = parseResult.data;
      const tenant = req.tenant!;

      console.log(`[WABA Dispatch] Tenant: ${tenant.name} | Sending template '${template_id}' to lead ${leadId} with vars:`, variables);

      const mockWabaMessageId = `waba_msg_${Date.now()}`;

      // Increment usage quota count in DB...
      
      return res.status(200).json({
        success: true,
        message: 'WhatsApp brochure template dispatched via Meta Cloud API.',
        waba_message_id: mockWabaMessageId,
        status: 'sent',
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'WABA Dispatch Failed', message: err.message });
    }
  }
);

/**
 * 3. ATOMIC STAGE CHANGE & MANDATORY NOTE LOGGING
 * POST /api/v1/leads/:id/actions/stage-change
 */
actionsRouter.post(
  '/:id/actions/stage-change',
  async (req: Request, res: Response) => {
    try {
      const leadId = req.params.id;
      const parseResult = StageChangeSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation Error', details: parseResult.error.format() });
      }

      const { new_stage_id, note } = parseResult.data;
      const tenant = req.tenant!;

      console.log(`[Stage Change] Lead ${leadId} -> Stage ${new_stage_id} | Note: "${note}"`);

      // In production: Run atomic SQL transaction updating stage_id AND inserting timeline_event

      return res.status(200).json({
        success: true,
        message: 'Lead stage updated and audit note recorded atomically.',
        lead_id: leadId,
        new_stage_id: new_stage_id,
        audit_note: note,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Stage Change Failed', message: err.message });
    }
  }
);

/**
 * 4. LEAD DEDUPLICATION MERGE ENGINE
 * POST /api/v1/leads/:id/actions/merge
 */
actionsRouter.post(
  '/:id/actions/merge',
  async (req: Request, res: Response) => {
    try {
      const primaryLeadId = req.params.id;
      const parseResult = MergeSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation Error', details: parseResult.error.format() });
      }

      const { duplicate_lead_id, merge_strategy } = parseResult.data;

      console.log(`[Merge Engine] Merging duplicate ${duplicate_lead_id} into primary ${primaryLeadId} using strategy '${merge_strategy}'`);

      // In production:
      // 1. UPDATE timeline_events SET lead_id = primaryLeadId WHERE lead_id = duplicate_lead_id
      // 2. UPDATE leads SET stage_id = 'merged_archived' WHERE id = duplicate_lead_id
      // 3. INSERT audit trail note on primary lead

      return res.status(200).json({
        success: true,
        message: `Successfully merged all timeline notes and call recordings from lead ${duplicate_lead_id} into primary lead ${primaryLeadId}.`,
        primary_lead_id: primaryLeadId,
        archived_duplicate_id: duplicate_lead_id,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Merge Engine Failed', message: err.message });
    }
  }
);

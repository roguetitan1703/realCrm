/**
 * ============================================================================
 * ⚡ UNIVERSAL ACTION-ORIENTED REST API ROUTES
 * ============================================================================
 * Handles domain workflows across ANY module record: Click-to-Call bridges,
 * WhatsApp template dispatches, atomic stage transitions, and record merging.
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
import { dispatchOutboundWebhook } from '../services/webhookSender';
import { addTimelineEvent, updateLead, mergeLeads, getLeadById, getIntegrations, getTimelineEventById, updateTimelineEvent } from '../services/store';
import { audit } from '../services/audit';

export const actionsRouter = Router();

actionsRouter.use(requireTenantAuth);

/**
 * REMARK — a threaded note on any record (lead or property). B1: many per
 * record, newest-first, author + time, author can edit their own (no delete).
 * POST /api/v1/records/:id/actions/remark
 */
actionsRouter.post('/:id/actions/remark', async (req: Request, res: Response) => {
  try {
    const recordId = req.params.id;
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Remark text is required' });
    const authorId = req.user?.id || null;
    const evt = await addTimelineEvent({
      record_id: recordId, type: 'remark', title: 'Remark', description: text,
      author: authorId || undefined,
    });
    audit({
      tenant_id: req.tenantId!, actor_type: 'user', actor_id: authorId,
      actor_label: authorId || 'system', action: 'remark.added',
      target_type: 'record', target_id: recordId, summary: 'Remark added', metadata: {},
    });
    return res.status(201).json({
      success: true,
      timeline_event: { id: evt.id, type: 'remark', label: text, authorId, timestamp: evt.timestamp, metadata: {} },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to add remark', message: err.message });
  }
});

// Event types a person can edit-own. Remark is the pure notes case (B1); call/
// wa/sms are B5's "add an outcome + remark to that action afterward" — same
// author-only rule, same endpoint, just also accepts an `outcome`. System/
// stage-change events are never author-editable — they're records, not notes.
const AUTHOR_EDITABLE_TYPES = new Set(['remark', 'call', 'whatsapp', 'sms']);

/**
 * Edit a remark (or attach outcome+remark to a logged call/message) —
 * author-only. Not the last-write-wins pattern of stage/status changes: this
 * literally rejects anyone but the person who wrote it.
 * PATCH /api/v1/records/:id/actions/remark/:eventId  body { text, outcome? }
 */
actionsRouter.patch('/:id/actions/remark/:eventId', async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const text = String(req.body?.text || '').trim();
    const outcome = req.body?.outcome ? String(req.body.outcome).trim() : undefined;
    if (!text && !outcome) return res.status(400).json({ error: 'Add a remark or an outcome' });
    const existing = await getTimelineEventById(eventId, req.tenantId!);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (!AUTHOR_EDITABLE_TYPES.has(existing.type)) return res.status(400).json({ error: 'This entry cannot be edited' });
    const authorId = req.user?.id || null;
    if (!authorId || existing.author !== authorId) {
      return res.status(403).json({ error: 'You can only edit your own entry' });
    }
    const finalText = text || existing.description;
    const updated = await updateTimelineEvent(eventId, req.tenantId!, finalText, outcome);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    audit({
      tenant_id: req.tenantId!, actor_type: 'user', actor_id: authorId,
      actor_label: authorId, action: existing.type === 'remark' ? 'remark.updated' : 'contact_action.updated',
      target_type: 'record', target_id: existing.record_id, summary: 'Entry edited', metadata: { outcome },
    });
    // DB type -> client-facing channel vocabulary (whatsapp -> wa), same
    // translation the contact-log route and mapEventForClient use.
    const clientType = existing.type === 'whatsapp' ? 'wa' : existing.type;
    return res.status(200).json({
      success: true,
      timeline_event: { id: updated.id, type: clientType, label: finalText, authorId, timestamp: updated.timestamp, metadata: updated.metadata },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to save', message: err.message });
  }
});

/**
 * B5 — log a plain contact action (call / WhatsApp / SMS) on ANY record: lead,
 * property, or a contact resolved to one. This is deliberately lightweight —
 * no module gating, no quota, no telephony-bridge simulation (that's the
 * Leads-specific /actions/call above) — it exists purely to record "the user
 * confirmed and was redirected to their dialer/WhatsApp", author-attributed,
 * so it can be edited afterward with an outcome + remark via the route above.
 * POST /api/v1/records/:id/actions/contact-log   body { channel: 'call'|'wa'|'sms' }
 */
actionsRouter.post('/:id/actions/contact-log', async (req: Request, res: Response) => {
  try {
    const recordId = req.params.id;
    // Frontend-facing channel name stays 'wa' (matches the rest of the app);
    // the DB type is 'whatsapp' to match the existing WABA dispatch route's
    // convention — one spelling for "this was a WhatsApp event", not two.
    const channel = ['call', 'wa', 'sms'].includes(req.body?.channel) ? req.body.channel : 'call';
    const dbType = channel === 'wa' ? 'whatsapp' : channel;
    const authorId = req.user?.id || null;
    const title = channel === 'call' ? 'Call' : channel === 'wa' ? 'WhatsApp' : 'SMS';
    const evt = await addTimelineEvent({
      record_id: recordId, type: dbType, title, description: `${title} initiated`,
      author: authorId || undefined,
    });
    audit({
      tenant_id: req.tenantId!, actor_type: 'user', actor_id: authorId,
      actor_label: authorId || 'system', action: 'contact_action.logged',
      target_type: 'record', target_id: recordId, summary: `${title} logged`, metadata: { channel },
    });
    return res.status(201).json({
      success: true,
      timeline_event: { id: evt.id, type: channel, label: evt.description, authorId, timestamp: evt.timestamp, metadata: {} },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to log the action', message: err.message });
  }
});

/**
 * 1. CLICK-TO-CALL TELEPHONY BRIDGE
 * POST /api/v1/records/:id/actions/call
 */
actionsRouter.post(
  '/:id/actions/call',
  requireModuleEnabled('dialer'),
  requireQuotaAvailable('call_minutes'),
  async (req: Request, res: Response) => {
    try {
      const recordId = req.params.id;
      const parseResult = CallActionSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation Error', details: parseResult.error.format() });
      }

      const { agent_id } = parseResult.data;
      const tenant = req.tenant!;

      const lead = await getLeadById(recordId);
      const leg1AgentPhone = req.user?.phone_number || '+919820011223';
      const leg2TargetPhone = lead?.phone || '+919876543210';
      
      const integrations = await getIntegrations();
      const exotelConfig = integrations.exotel || {};
      const virtualLandlineDid = exotelConfig.did || '08045678900';
      const apiKey = exotelConfig.apiKey || 'exo_live_default_key';

      console.log(`[Exotel Bridge] Tenant: ${tenant.name} | Key: ${apiKey} | Dialing Leg 1: ${leg1AgentPhone} -> Leg 2: ${leg2TargetPhone} via DID ${virtualLandlineDid}`);

      const callSid = `call_exo_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const evt = await addTimelineEvent({
        record_id: recordId,
        type: 'call',
        title: 'Outbound Call Initiated',
        description: `Initiated outbound telephony call to ${leg2TargetPhone} via DID ${virtualLandlineDid} (SID: ${callSid}).`,
        author: agent_id,
        metadata: { call_sid: callSid, status: 'initiated', leg1: leg1AgentPhone, did: virtualLandlineDid },
      });

      return res.status(200).json({
        success: true,
        message: 'Cloud telephony call bridge initiated. Leg 1 will ring in 2 seconds.',
        call_sid: callSid,
        timeline_event: evt,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Telephony Bridge Failed', message: err.message });
    }
  }
);

/**
 * 2. OUTBOUND WHATSAPP BUSINESS (WABA) DISPATCH
 * POST /api/v1/records/:id/actions/whatsapp
 */
actionsRouter.post(
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
      const tenant = req.tenant!;

      const integrations = await getIntegrations();
      const wabaConfig = integrations.waba || {};
      const phoneId = wabaConfig.phoneId || 'waba_phone_default';

      console.log(`[WABA Dispatch] Tenant: ${tenant.name} | PhoneID: ${phoneId} | Sending template '${template_id}' to record ${recordId} with vars:`, variables);

      const wabaMessageId = `waba_msg_${Date.now()}`;

      const evt = await addTimelineEvent({
        record_id: recordId,
        type: 'whatsapp',
        title: 'WhatsApp Template Sent',
        description: `Dispatched WABA template "${template_id}" via Meta Cloud API (Message ID: ${wabaMessageId}).`,
        // B5: the initiator is the author, so they can attach outcome+remark
        // afterward (PATCH .../remark/:eventId, author-only). This route never
        // set author before, so that edit would 403 for everyone — silently.
        author: req.user?.id,
        metadata: { template_id, variables, waba_message_id: wabaMessageId, phone_id: phoneId },
      });

      return res.status(200).json({
        success: true,
        message: 'WhatsApp template message dispatched via Meta Cloud API.',
        waba_message_id: wabaMessageId,
        timeline_event: evt,
        status: 'sent',
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'WABA Dispatch Failed', message: err.message });
    }
  }
);

/**
 * 3. ATOMIC STAGE CHANGE & MANDATORY NOTE LOGGING
 * POST /api/v1/records/:id/actions/stage-change
 */
actionsRouter.post(
  '/:id/actions/stage-change',
  async (req: Request, res: Response) => {
    try {
      const recordId = req.params.id;
      const parseResult = StageChangeSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation Error', details: parseResult.error.format() });
      }

      const { new_stage_id, note } = parseResult.data;

      console.log(`[Stage Change] Record ${recordId} -> Stage ${new_stage_id} | Note: "${note}"`);

      await updateLead(recordId, { stage: new_stage_id });

      const evt = await addTimelineEvent({
        record_id: recordId,
        type: 'stage_change',
        title: `Stage Changed -> ${new_stage_id}`,
        description: note || `Stage updated to ${new_stage_id}.`,
        author: req.user?.id || 'admin',
      });

      dispatchOutboundWebhook(
        req.tenant?.slug || 'skyline-realty',
        'LEAD_STAGE_CHANGED',
        { record_id: recordId, new_stage_id, note, updated_by: req.user?.id || 'admin' },
        'https://api.skylinerealty.in/webhooks/outbound',
        'whsec_default'
      ).catch(err => console.error('[Stage Change Webhook] Dispatch error:', err));

      return res.status(200).json({
        success: true,
        message: 'Record stage updated and audit note recorded atomically.',
        record_id: recordId,
        new_stage_id: new_stage_id,
        audit_note: note,
        timeline_event: evt,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Stage Change Failed', message: err.message });
    }
  }
);

/**
 * 4. UNIVERSAL RECORD DEDUPLICATION MERGE ENGINE
 * POST /api/v1/records/:id/actions/merge
 */
actionsRouter.post(
  '/:id/actions/merge',
  async (req: Request, res: Response) => {
    try {
      const primaryRecordId = req.params.id;
      const parseResult = MergeSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation Error', details: parseResult.error.format() });
      }

      const { duplicate_record_id, merge_strategy } = parseResult.data;

      console.log(`[Merge Engine] Merging duplicate ${duplicate_record_id} into primary ${primaryRecordId} using strategy '${merge_strategy}'`);

      const merged = await mergeLeads(primaryRecordId, duplicate_record_id);

      return res.status(200).json({
        success: true,
        message: `Successfully merged all timeline notes and call recordings from record ${duplicate_record_id} into primary record ${primaryRecordId}.`,
        primary_record_id: primaryRecordId,
        archived_duplicate_id: duplicate_record_id,
        data: merged,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Merge Engine Failed', message: err.message });
    }
  }
);

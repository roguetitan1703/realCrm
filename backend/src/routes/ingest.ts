/**
 * ============================================================================
 * 📥 INBOUND WEBHOOK INGESTION ROUTER (PULL & PORTAL CONNECTORS)
 * ============================================================================
 * Receives real-time lead inquiries from 99acres, MagicBricks, Meta Lead Ads,
 * and company websites. Enforces HMAC signature verification, idempotency,
 * deduplication matching, and round-robin agent assignment via queue engine.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import { WebhookIngestSchema } from '../models';
import { queueManager } from '../services/queue';
import { signWebhookPayload } from '../services/webhookSender';
import { getLeads, createLead, addTimelineEvent, updateLead, getIntegrations, getRoutingRules, updateRoutingRules, getAgents } from '../services/store';

export const ingestRouter = Router();

/**
 * Register background worker for webhook ingestion processing
 */
queueManager.registerWorker('webhook-ingest', async (job) => {
  const { tenantSlug, sourceKey, leadData, assignedAgentId, action, existingLeadId, note } = job.payload;
  console.log(`[Webhook Ingest Worker] Processing action '${action}' for '${tenantSlug}'`);
  if (action === 'merge_dedup' && existingLeadId) {
    await addTimelineEvent({
      record_id: existingLeadId,
      type: 'merge',
      title: 'Duplicate Inquiry Merged',
      description: note || `Duplicate inquiry from ${sourceKey} automatically merged.`,
    });
  }
}, 10);

/**
 * PORTAL WEBHOOK INGESTION ENDPOINT
 * POST /api/v1/ingest/:tenantSlug/:sourceKey
 */
ingestRouter.post('/:tenantSlug/:sourceKey', async (req: Request, res: Response) => {
  const { tenantSlug, sourceKey } = req.params;
  const signature = req.headers['x-realcrm-signature'] as string;

  console.log(`[Webhook Ingest] Received POST for tenant '${tenantSlug}', source '${sourceKey}'`);

  // 1. Fetch integration settings from PostgreSQL to verify webhook secret
  const integrations = await getIntegrations();
  const portalConfig = integrations[sourceKey] || integrations['99acres'] || {};
  const tenantSecret = portalConfig.secret || 'whsec_bhumi_prod_901';

  // 2. HMAC SHA-256 Webhook Security Verification
  if (tenantSecret) {
    if (!signature) {
      console.warn(`[Webhook Ingest] Rejected: Missing X-RealCRM-Signature header for '${tenantSlug}'`);
      return res.status(401).json({ error: 'Unauthorized', message: 'Missing X-RealCRM-Signature HMAC header' });
    }
    const expectedSignature = signWebhookPayload(req.body, tenantSecret);
    if (signature !== expectedSignature) {
      console.warn(`[Webhook Ingest] Rejected: Signature mismatch! Received '${signature}', expected '${expectedSignature}'`);
      return res.status(403).json({ error: 'Forbidden', message: 'HMAC signature verification failed. Payload may be tampered.' });
    }
    console.log(`[Webhook Ingest] Verified HMAC SHA-256 signature successfully.`);
  }

  // 2. Validate payload against Zod schema
  const parseResult = WebhookIngestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid Payload Shape', details: parseResult.error.format() });
  }

  const leadData = parseResult.data;

  try {
    // 3. Idempotency Check (prevent duplicate processing of same portal retry)
    const idempotencyKey = `dedup:${tenantSlug}:${sourceKey}:${leadData.external_id}`;
    const alreadyProcessed = queueManager.checkIdempotencyLock(idempotencyKey);
    if (alreadyProcessed) {
      console.log(`[Webhook Ingest] Idempotency hit! Skipping already processed external_id: ${leadData.external_id}`);
      return res.status(200).json({ status: 'ignored', reason: 'Idempotent retry already processed' });
    }
    queueManager.setIdempotencyLock(idempotencyKey, 604800); // Lock for 7 days

    // 4. Automatic Lead Deduplication Matching (Check exact phone match in existing leads)
    const cleanPhone = leadData.phone.replace(/[^0-9+]/g, '');
    const leads = await getLeads();
    const existingLead = leads.find(l => (l.phone && l.phone.replace(/[^0-9+]/g, '') === cleanPhone));

    if (existingLead) {
      console.log(`[Webhook Ingest] Deduplication hit! Lead '${leadData.name}' (${cleanPhone}) matches existing lead ${existingLead.id}`);
      
      const newNotes = [`[DUPLICATE INQUIRY MERGED] New inquiry from ${sourceKey} automatically attached.`, ...(existingLead.notes || [])];
      await updateLead(existingLead.id, { notes: newNotes });

      await queueManager.enqueue('webhook-ingest', {
        action: 'merge_dedup',
        tenantSlug,
        sourceKey,
        existingLeadId: existingLead.id,
        leadData,
        note: `[DUPLICATE INQUIRY MERGED] New inquiry from ${sourceKey} automatically attached to existing lead record.`
      });

      return res.status(200).json({
        success: true,
        status: 'deduplicated_merged',
        tenant_slug: tenantSlug,
        source: sourceKey,
        external_id: leadData.external_id,
        merged_into_lead_id: existingLead.id,
        assigned_agent: existingLead.agentId || existingLead.assigned_agent_id
      });
    }

    // 5. Round-Robin Lead Routing Rule from PostgreSQL Server Store
    const rules = await getRoutingRules();
    const activeAgents = (rules.active_agent_ids && rules.active_agent_ids.length > 0) ? rules.active_agent_ids : ['a1', 'a2', 'a3'];
    const nextIdx = (rules.last_assigned_index + 1) % activeAgents.length;
    const assignedAgentId = activeAgents[nextIdx];
    await updateRoutingRules({ last_assigned_index: nextIdx });

    const newLead = await createLead({
      name: leadData.name,
      phone: leadData.phone,
      email: leadData.email || '',
      stage: 'New',
      agentId: assignedAgentId,
      source: sourceKey,
      req: { locality: leadData.custom_attributes?.locality || 'Pune', config: leadData.custom_attributes?.config || '2 BHK' },
      custom_attributes: leadData.custom_attributes
    });

    // 6. Enqueue background ingestion processing job
    const jobId = await queueManager.enqueue('webhook-ingest', {
      action: 'create_new',
      tenantSlug,
      sourceKey,
      leadData,
      assignedAgentId
    });

    console.log(`[Webhook Ingest] Successfully ingested new lead '${leadData.name}' -> assigned to ${assignedAgentId} (Job: ${jobId})`);

    return res.status(200).json({
      success: true,
      status: 'ingested',
      tenant_slug: tenantSlug,
      source: sourceKey,
      external_id: leadData.external_id,
      assigned_agent_id: assignedAgentId,
      job_id: jobId
    });
  } catch (err: any) {
    console.error(`[Webhook Ingest] Internal Error:`, err.message);
    return res.status(500).json({ error: 'Ingestion Pipeline Error', message: err.message });
  }
});

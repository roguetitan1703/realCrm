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

export const ingestRouter = Router();

// In-memory mock database for leads and tenants in development
const inMemoryLeads: Array<any> = [
  { id: 'lead-1', name: 'Vikram Mehta', phone: '+91 98200 11223', email: 'vikram@mehta.in', stage_id: 'new', assigned_agent_id: 'a1', source: '99acres' },
  { id: 'lead-2', name: 'Sneha Rao', phone: '+91 98200 44556', email: 'sneha@rao.com', stage_id: 'visit_scheduled', assigned_agent_id: 'a2', source: 'MagicBricks' }
];

const inMemoryTenants: Record<string, { secret: string; agents: string[]; lastAgentIdx: number }> = {
  'bhumi-propcity': { secret: 'whsec_bhumi_prod_901', agents: ['a1', 'a2', 'a3'], lastAgentIdx: 0 },
  'demo': { secret: 'whsec_demo_secret_123', agents: ['a1', 'a2'], lastAgentIdx: 0 }
};

/**
 * Register background worker for webhook ingestion processing
 */
queueManager.registerWorker('webhook-ingest', async (job) => {
  const { tenantSlug, sourceKey, leadData, assignedAgentId } = job.payload;
  console.log(`[Webhook Ingest Worker] Processing lead '${leadData.name}' (${leadData.phone}) for '${tenantSlug}' assigned to ${assignedAgentId}`);
  // In production: insert into PostgreSQL leads table and publish WebSocket event to frontend store
}, 10);

/**
 * PORTAL WEBHOOK INGESTION ENDPOINT
 * POST /api/v1/ingest/:tenantSlug/:sourceKey
 */
ingestRouter.post('/:tenantSlug/:sourceKey', async (req: Request, res: Response) => {
  const { tenantSlug, sourceKey } = req.params;
  const signatureHeader = (req.headers['x-realcrm-signature'] || req.headers['x-hub-signature'] || req.headers['x-propcity-signature']) as string;

  console.log(`[Webhook Ingest] Received payload for Tenant: '${tenantSlug}' | Source: '${sourceKey}'`);

  try {
    const tenant = inMemoryTenants[tenantSlug];
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant Workspace Not Found', slug: tenantSlug });
    }

    // 1. Verify HMAC SHA-256 signature if header is provided
    if (signatureHeader) {
      const expectedSignature = signWebhookPayload(JSON.stringify(req.body), tenant.secret);
      if (signatureHeader !== expectedSignature && signatureHeader !== `sha256=${expectedSignature}`) {
        console.warn(`[Webhook Ingest] HMAC Signature mismatch for ${tenantSlug}/${sourceKey}`);
        return res.status(401).json({ error: 'Invalid HMAC Signature', source: sourceKey });
      }
    }

    // 2. Validate runtime Zod schema
    const parseResult = WebhookIngestSchema.safeParse(req.body);
    if (!parseResult.success) {
      console.warn(`[Webhook Ingest] Malformed payload from ${sourceKey}:`, parseResult.error.format());
      return res.status(400).json({
        error: 'Malformed Webhook Payload',
        source: sourceKey,
        details: parseResult.error.format(),
      });
    }

    const leadData = parseResult.data;

    // 3. Idempotency Check (Prevents portal retries from creating duplicate leads)
    const idempotencyKey = `dedup:${tenantSlug}:${sourceKey}:${leadData.external_id}`;
    if (queueManager.checkIdempotencyLock(idempotencyKey)) {
      console.log(`[Webhook Ingest] Ignored duplicate idempotent retry for key: ${idempotencyKey}`);
      return res.status(200).json({ status: 'ignored', reason: 'Idempotent retry already processed' });
    }
    queueManager.setIdempotencyLock(idempotencyKey, 604800); // Lock for 7 days

    // 4. Automatic Lead Deduplication Matching (Check exact phone match in existing leads)
    const cleanPhone = leadData.phone.replace(/[^0-9+]/g, '');
    const existingLead = inMemoryLeads.find(l => l.phone.replace(/[^0-9+]/g, '') === cleanPhone);

    if (existingLead) {
      console.log(`[Webhook Ingest] Deduplication hit! Lead '${leadData.name}' (${cleanPhone}) matches existing lead ${existingLead.id}`);
      // Automatic Merge Decision: Do NOT create duplicate row. Append timeline alert!
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
        assigned_agent: existingLead.assigned_agent_id
      });
    }

    // 5. Round-Robin Lead Routing Rule -> Assign to next active agent in roster
    tenant.lastAgentIdx = (tenant.lastAgentIdx + 1) % tenant.agents.length;
    const assignedAgentId = tenant.agents[tenant.lastAgentIdx];

    const newLead = {
      id: `lead_${Date.now()}`,
      name: leadData.name,
      phone: leadData.phone,
      email: leadData.email || '',
      stage_id: 'new',
      assigned_agent_id: assignedAgentId,
      source: sourceKey,
      custom_attributes: leadData.custom_attributes
    };
    inMemoryLeads.push(newLead);

    // 6. Enqueue background ingestion processing job
    const jobId = await queueManager.enqueue('webhook-ingest', {
      action: 'create_new',
      tenantSlug,
      sourceKey,
      leadData,
      assignedAgentId
    });

    console.log(`[Webhook Ingest] Successfully ingested new lead '${leadData.name}' -> assigned to ${assignedAgentId} (Job: ${jobId})`);

    // Return immediate HTTP 200 OK Accepted
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

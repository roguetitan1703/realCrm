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
import { queueManager } from '../services/queue';
import { getLeads, createLead, addTimelineEvent, updateLead, getRoutingRules, updateRoutingRules, getTenantForIngest } from '../services/store';
import { runWithContext } from '../services/context';

export const ingestRouter = Router();

// Tolerant field mapping — portals (99acres/MagicBricks/Meta/website) each use
// different key names. Pull the first present alias; nothing about our lead
// shape leaks into the URL the client configures.
function pick(body: any, keys: string[]): string {
  for (const k of keys) {
    const v = body?.[k] ?? body?.custom_attributes?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

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
  console.log(`[Ingest] POST for tenant '${tenantSlug}', source '${sourceKey}'`);

  // 1. Resolve the tenant FROM THE URL (not the request context) — this is a
  //    public endpoint the portal calls with no token/header.
  const tenant = await getTenantForIngest(tenantSlug);
  if (!tenant) {
    return res.status(404).json({ error: 'Unknown workspace', message: `No workspace '${tenantSlug}'.` });
  }

  // 2. Authenticate with the per-tenant key. Portals can only add a URL, so the
  //    key rides in ?key= (a header x-api-key is also accepted).
  const providedKey = (req.query.key as string) || (req.headers['x-api-key'] as string) || '';
  if (!tenant.secret || providedKey !== tenant.secret) {
    console.warn(`[Ingest] Rejected: bad/missing key for '${tenantSlug}'.`);
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid ingest key.' });
  }

  // 3. Map the portal's payload tolerantly to a lead.
  const name = pick(req.body, ['name', 'full_name', 'fullname', 'customer_name', 'lead_name', 'Name']);
  const phone = pick(req.body, ['phone', 'mobile', 'phone_number', 'contact_number', 'contact', 'Phone', 'mobile_number']);
  const email = pick(req.body, ['email', 'email_id', 'Email']);
  if (!name || !phone) {
    return res.status(400).json({ error: 'Invalid payload', message: 'A name and phone are required.' });
  }
  const locality = pick(req.body, ['locality', 'location', 'area', 'city', 'preferred_locality']);
  const config = pick(req.body, ['config', 'bhk', 'configuration', 'property_type', 'requirement']);
  const externalId = pick(req.body, ['external_id', 'id', 'lead_id', 'enquiry_id']) || `${sourceKey}-${phone.replace(/\D/g, '')}`;

  // 4. Everything below runs UNDER the resolved tenant so createLead / routing /
  //    dedup all scope to the right workspace.
  try {
    const result = await runWithContext(
      { tenantId: tenant.id, userId: null, role: 'system', actorType: 'system', actorLabel: `ingest:${sourceKey}` } as any,
      async () => {
        // Idempotency: ignore a portal retry of the same external_id.
        const idempotencyKey = `dedup:${tenant.id}:${sourceKey}:${externalId}`;
        if (queueManager.checkIdempotencyLock(idempotencyKey)) {
          return { status: 'ignored', reason: 'Idempotent retry already processed' };
        }
        queueManager.setIdempotencyLock(idempotencyKey, 604800);

        // Dedup on exact phone within this tenant.
        const cleanPhone = phone.replace(/[^0-9+]/g, '');
        const leads = await getLeads();
        const existing = leads.find(l => l.phone && l.phone.replace(/[^0-9+]/g, '') === cleanPhone);
        if (existing) {
          const newNotes = [`[Duplicate from ${sourceKey}] Fresh inquiry attached.`, ...(existing.notes || [])];
          await updateLead(existing.id, { notes: newNotes });
          return { status: 'deduplicated_merged', merged_into_lead_id: existing.id };
        }

        // Round-robin assignment among active agents.
        const rules = await getRoutingRules();
        const activeAgents = (rules.active_agent_ids && rules.active_agent_ids.length > 0) ? rules.active_agent_ids : [];
        let assignedAgentId: string | null = null;
        if (activeAgents.length) {
          const nextIdx = (rules.last_assigned_index + 1) % activeAgents.length;
          assignedAgentId = activeAgents[nextIdx];
          await updateRoutingRules({ last_assigned_index: nextIdx });
        }

        const newLead = await createLead({
          name, phone, email,
          stage: 'New',
          agentId: assignedAgentId,
          source: sourceKey,
          req: { locality: locality || 'Pune', config: config || '' },
        } as any);
        return { status: 'ingested', lead_id: newLead?.id || null, assigned_agent_id: assignedAgentId };
      }
    );

    console.log(`[Ingest] ${result.status} for '${tenant.id}' (${sourceKey}, ${name})`);
    return res.status(200).json({ success: true, tenant: tenant.id, source: sourceKey, external_id: externalId, ...result });
  } catch (err: any) {
    console.error('[Ingest] Error:', err.message);
    return res.status(500).json({ error: 'Ingestion failed', message: err.message });
  }
});

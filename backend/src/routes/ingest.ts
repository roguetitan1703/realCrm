/**
 * ============================================================================
 * 📥 INBOUND WEBHOOK INGESTION (spec: docs/specs/ingestion.md — D1)
 * ============================================================================
 * INBOX FIRST. A push lands as a raw row and is acknowledged; a lead is created
 * only once a parser is configured for that connection.
 *
 * What changed and why: the previous version read each payload through a
 * hardcoded alias list and created a lead immediately. If a provider named a
 * field something we hadn't anticipated, the value was dropped with no record —
 * and the payload we'd need in order to fix the mapping was never kept. That
 * makes onboarding a new provider guesswork. Now the first push IS the
 * specification for the mapping.
 *
 * The key alone resolves BOTH tenant and provider, so the URL carries no
 * authority. The tenant in the path is kept for readability and is checked
 * against the key rather than trusted.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import {
  resolveByKey, recordPush, markInbox, logReject, processInboxRow,
} from '../services/ingestion';
import { getTenantForIngest } from '../services/store';

export const ingestRouter = Router();

const clientIp = (req: Request): string | null =>
  ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() || req.socket?.remoteAddress || null;

const presentedKey = (req: Request): string =>
  (req.headers['x-api-key'] as string) || (req.query.key as string) || '';

/**
 * POST /api/v1/ingest/:tenantSlug            (canonical)
 * POST /api/v1/ingest/:tenantSlug/:source    (back-compat with the old URL —
 *   portals already configured against it keep working; the source segment is
 *   a label only, since the key decides the provider.)
 *
 * Auth: `X-API-Key`, or `?key=` for portals whose UI only accepts a URL.
 */
async function handleIngest(req: Request, res: Response) {
  const { tenantSlug } = req.params;
  const key = presentedKey(req);
  const ip = clientIp(req);

  const integration = await resolveByKey(key);
  if (!integration) {
    // No body is stored for an unauthenticated caller — an endpoint that
    // persisted arbitrary payloads from anyone who can reach the URL is an
    // open write into our database. Metadata only, collapsed per ip+key+day.
    await logReject({ ip, presentedKey: key, path: req.originalUrl.split('?')[0], tenantHint: tenantSlug })
      .catch(err => console.warn('[Ingest] reject log failed:', err?.message));
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid API key.' });
  }

  // Defence in depth: a valid key for tenant A must not be accepted on tenant
  // B's URL. The key wins, so this can only ever reject — never reassign.
  if (tenantSlug) {
    const t = await getTenantForIngest(tenantSlug);
    if (t && t.id !== integration.tenant_id) {
      await logReject({ ip, presentedKey: key, path: req.originalUrl.split('?')[0], tenantHint: tenantSlug })
        .catch(() => {});
      return res.status(401).json({ error: 'Unauthorized', message: 'Key does not belong to this workspace.' });
    }
  }

  let inboxId: string;
  try {
    inboxId = await recordPush({ integration, body: req.body, headers: req.headers as any, ip });
  } catch (err: any) {
    console.error('[Ingest] Could not record push:', err.message);
    return res.status(500).json({ error: 'Ingestion failed', message: 'Could not record the payload.' });
  }

  // Acknowledge NOW. Providers retry on a slow response, and a retry storm
  // turns one enquiry into twenty. Parsing happens after the response.
  res.status(200).json({ success: true, received: true, id: inboxId });

  // No parser yet: the push stays pending and visible as inbound activity.
  // This is the deferred-load rule — better a visible unparsed payload than a
  // lead invented from a guess.
  if (!integration.parser_config) {
    console.log(`[Ingest] ${integration.provider}: stored pending (no parser configured)`);
    return;
  }

  try {
    const out = await processInboxRow(integration, inboxId, req.body);
    console.log(`[Ingest] ${integration.provider}: ${out.status}${out.leadId ? ` → ${out.leadId}` : ''}`);
  } catch (err: any) {
    console.error('[Ingest] Parse failed:', err.message);
    await markInbox(inboxId, 'failed', { error: err.message }).catch(() => {});
  }
}

ingestRouter.post('/:tenantSlug', handleIngest);
ingestRouter.post('/:tenantSlug/:source', handleIngest);

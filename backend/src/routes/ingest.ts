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

/**
 * Where a key can arrive. Every one of these is something a real portal does,
 * and a portal that cannot send a header is not going to write us a custom
 * integration — it will just fail silently and the broker will blame the CRM.
 *
 *   X-API-Key:        the documented way
 *   Authorization:    Bearer <key> / ApiKey <key>, for systems whose UI only
 *                     exposes an "auth token" field
 *   X-Auth-Token:     seen on older Indian portal panels
 *   ?key= / ?apikey= / ?api_key= / ?token=  URL-only integrations
 */
const presentedKey = (req: Request): string => {
  const h = req.headers;
  const auth = String(h['authorization'] || '').trim();
  const fromAuth = /^(bearer|apikey|token)\s+/i.test(auth) ? auth.split(/\s+/)[1] : (auth.startsWith('sk_') ? auth : '');
  const q = req.query as Record<string, any>;
  return String(
    h['x-api-key'] || h['x-auth-token'] || fromAuth ||
    q.key || q.apikey || q.api_key || q.token || '',
  ).trim();
};

/** Keys never belong in the stored payload — they are credentials, not fields. */
const KEY_PARAMS = new Set(['key', 'apikey', 'api_key', 'token', 'auth', 'secret']);

/**
 * What the provider actually sent, whatever shape it came in.
 *
 * A JSON body is the documented case. The rest are not edge cases — they are
 * the majority of small-portal integrations: GET with the enquiry in the query
 * string, form-encoded POSTs, and JSON sent under text/plain because someone
 * left the content-type at its default. Landing an empty {} for any of these
 * loses a real enquiry a broker paid for.
 */
function payloadOf(req: Request): any {
  const body: any = req.body;

  // text/plain (or no content-type) that is really JSON.
  if (typeof body === 'string') {
    const t = body.trim();
    if (t) {
      try { return JSON.parse(t); } catch { return { _unparsed: t.slice(0, 20000) }; }
    }
  }

  const hasBody = body && typeof body === 'object' && Object.keys(body).length > 0;
  const query: Record<string, any> = {};
  for (const [k, v] of Object.entries(req.query || {})) {
    if (!KEY_PARAMS.has(k.toLowerCase())) query[k] = v;
  }
  const hasQuery = Object.keys(query).length > 0;

  if (hasBody && hasQuery && !Array.isArray(body)) return { ...query, ...body };
  if (hasBody) return body;
  if (hasQuery) return query;
  return body ?? {};
}

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
  const payload = payloadOf(req);

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
    inboxId = await recordPush({ integration, body: payload, headers: req.headers as any, ip });
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
    const out = await processInboxRow(integration, inboxId, payload);
    console.log(`[Ingest] ${integration.provider}: ${out.status}${out.leadId ? ` → ${out.leadId}` : ''}`);
  } catch (err: any) {
    console.error('[Ingest] Parse failed:', err.message);
    await markInbox(inboxId, 'failed', { error: err.message }).catch(() => {});
  }
}

// POST is the documented method. GET is accepted because a real portion of
// portal panels only let you paste a URL — they fire a GET with the enquiry in
// the query string and no way to set a body or a header. Refusing those means
// telling a broker their aggregator "isn't supported"; accepting them costs one
// route line. PUT/PATCH are here for the same reason: some senders use them for
// an update-or-create and would otherwise get a 404 they cannot diagnose.


for (const path of ['/:tenantSlug', '/:tenantSlug/:source']) {
  ingestRouter.post(path, handleIngest);
  ingestRouter.get(path, handleIngest);
  ingestRouter.put(path, handleIngest);
  ingestRouter.patch(path, handleIngest);
}

// Anything else on the endpoint gets a usable answer rather than the SPA's
// index.html — a provider debugging their config needs to see which methods
// exist, not a page of HTML.
// Two registrations rather than an optional `:source?` — Express 5's router
// rejects the `?` suffix outright, and it does so at startup, which takes the
// whole API down rather than just this route.
const methodNotAllowed = (req: Request, res: Response) => {
  res.set('Allow', 'GET, POST, PUT, PATCH');
  return res.status(405).json({
    error: 'Method not allowed',
    message: `Send the enquiry as GET, POST, PUT or PATCH. Received ${req.method}.`,
  });
};
ingestRouter.all('/:tenantSlug', methodNotAllowed);
ingestRouter.all('/:tenantSlug/:source', methodNotAllowed);

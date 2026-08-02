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
function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/**
 * GET /api/v1/ingest/:tenantSlug/docs
 * Clean, tenant-based documentation page for all lead provider integrations.
 */
ingestRouter.get('/:tenantSlug/docs', async (req: Request, res: Response) => {
  const { tenantSlug } = req.params;
  const t = await getTenantForIngest(tenantSlug);
  const firmName = t?.name || tenantSlug;

  const host = req.get('x-forwarded-host') || req.get('host') || 'api.re.delpat.in';
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const domain = process.env.PUBLIC_API_URL || `${proto}://${host}`;
  const endpoint = `${domain}/api/v1/ingest/${tenantSlug}`;

  const rawKey = typeof req.query.key === 'string' && req.query.key.trim() ? req.query.key.trim() : null;
  const key = rawKey ? escapeHtml(rawKey) : '&lt;YOUR_CONNECTION_API_KEY&gt;';

  const sampleJson = '{"name":"Test Enquiry","phone":"9876543210","locality":"Wakad"}';
  const curlExample = `curl -X POST "${endpoint}" \\\n  -H "X-API-Key: ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '${sampleJson}'`;

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(firmName)} — Inbound Webhook Integration</title>
<style>
:root{color-scheme:light dark;--ink:#1a1d1a;--muted:#6b7570;--line:#e2e5e1;--card:#fff;--wash:#f6f5f2;--accent:#1e6f52}
@media(prefers-color-scheme:dark){:root{--ink:#eef0ec;--muted:#9aa39c;--line:#2c322d;--card:#1a1d1a;--wash:#14161380;--accent:#4fae86}}
*{box-sizing:border-box}
body{margin:0;background:var(--wash);color:var(--ink);font:15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;padding:40px 20px}
main{max-width:640px;margin:0 auto}
h1{font-size:20px;font-weight:600;margin:0 0 4px}
.sub{color:var(--muted);font-size:13.5px;margin:0 0 32px}
h2{font-size:12.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:32px 0 10px}
p{margin:0 0 10px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
td{padding:9px 0;border-bottom:1px solid var(--line);vertical-align:top}
td:first-child{color:var(--muted);white-space:nowrap;padding-right:16px;width:110px}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}
code{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:1px 5px}
pre{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px 16px;overflow-x:auto;line-height:1.6;margin:0}
ul{margin:0;padding-left:20px}
li{margin-bottom:6px}
footer{margin-top:40px;color:var(--muted);font-size:12px}
</style>
</head><body><main>

<h1>${escapeHtml(firmName)} Webhook Integration</h1>
<p class="sub">How to send real-time lead enquiries into this workspace.</p>

<h2>Webhook Endpoint</h2>
<table><tbody>
<tr><td>URL</td><td><code>${endpoint}</code></td></tr>
<tr><td>Method</td><td>POST (GET, PUT and PATCH are also accepted)</td></tr>
<tr><td>Body</td><td>JSON payload (form-encoded and text/plain also accepted)</td></tr>
</tbody></table>

<h2>Authentication</h2>
<p>Use your provider's assigned API key in any one of these:</p>
<ul>
<li>Header <code>X-API-Key: ${key}</code></li>
<li>Header <code>Authorization: Bearer ${key}</code></li>
<li>Query parameter <code>?key=${key}</code> (if your system cannot set custom headers)</li>
</ul>

<h2>Sample Request</h2>
<pre>${curlExample}</pre>

<h2>Response Codes</h2>
<table><tbody>
<tr><td>200</td><td>Received and queued for ingestion into CRM.</td></tr>
<tr><td>401</td><td>Missing or invalid API key.</td></tr>
</tbody></table>

<footer>Send one test enquiry first to verify delivery before turning on the live feed.</footer>
</main></body></html>`;

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  return res.status(200).send(html);
});

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

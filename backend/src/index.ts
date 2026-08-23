/**
 * ============================================================================
 * 🚀 BHUMI PROPCITY CRM — MAIN EXPRESS SERVER ENTRY POINT
 * ============================================================================
 * Binds all modular domain routers, authentication middleware, workspace
 * resolution endpoints, and error handlers into a unified REST API server.
 * ============================================================================
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { workspaceRouter } from './routes/workspace';
import { modulesRouter } from './routes/modules';
import { recordsRouter } from './routes/records';
import { leadsRouter } from './routes/leads';
import { ownersRouter } from './routes/owners';
import { propertiesRouter } from './routes/properties';
import { teamRouter } from './routes/team';
import { actionsRouter } from './routes/actions';
import { ingestRouter } from './routes/ingest';
import { connectionsRouter } from './routes/connections';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { notificationsRouter } from './routes/notifications';
import { pwaRouter } from './routes/pwa';
import { filesRouter, mediaRouter } from './routes/files';
import { withRequestContext } from './middleware/auth';
import { getTenantForIngest, runRoutingSweeps } from './services/store';
import { envBanner } from './services/env';

// ── A DROPPED DATABASE CONNECTION USED TO KILL THE WHOLE API ────────────────
//
// 2026-08-22, 06:45 UTC: Supabase terminated this pool's connections — 57P01,
// "terminating connection due to administrator command", which is a maintenance
// restart on their side, not anything this process did. The routing sweep's
// query was caught and logged. Another one rejected with nothing listening, and
// Node's default for an unhandled rejection is to throw and exit.
//
// The API stayed down for eight hours. Roughly eleven portal enquiries hit a
// closed socket in that window and there is no record of any of them: a push
// that never lands writes no webhook_inbox row, so the inbox-first guarantee
// only covers requests that arrive. Nothing else noticed either.
//
// No try/catch at any call site could have caught it. The rejecting promise was
// one postgres.js creates for ITSELF while reconnecting, not one of our
// queries — its stack carried none of the origin frames that `queryError`
// appends to a `sql` call site. A process-level handler is the only thing that
// sees it.
//
// Staying up is the correct response to a connection this process did not
// close: postgres.js reconnects on its own within seconds. Anything we cannot
// recognise as a connection fault still exits, so a supervisor can restart a
// genuinely broken process rather than leave a wedged one serving traffic.

/** Postgres SQLSTATEs and socket errnos that mean "the link went away". */
const TRANSIENT_CONNECTION = new Set([
  '57P01', // admin terminated the backend (Supabase maintenance) — this crash
  '57P02', // crash shutdown
  '57P03', // cannot connect now, database is starting up
  '08001', '08003', '08006', // connection rejected / does not exist / failure
  'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED',
  'CONNECTION_CLOSED', 'CONNECTION_ENDED', 'CONNECT_TIMEOUT', // postgres.js
]);
const isConnectionFault = (e: any): boolean => Boolean(e) && TRANSIENT_CONNECTION.has(e.code);

process.on('unhandledRejection', (reason: any) => {
  // Never exit. Before this handler existed, every one of these was fatal.
  if (isConnectionFault(reason)) {
    console.error(`[Unhandled Rejection] ${reason.code}: ${reason.message} — staying up, the pool reconnects.`);
    return;
  }
  console.error('[Unhandled Rejection] Not a connection fault — this is a bug, and the stack is the only record of it:');
  console.error(reason?.stack || reason);
});

process.on('uncaughtException', (err: any) => {
  if (isConnectionFault(err)) {
    console.error(`[Uncaught Exception] ${err.code}: ${err.message} — staying up, the pool reconnects.`);
    return;
  }
  console.error('[Uncaught Exception] Exiting; process state is not trustworthy after this:');
  console.error(err?.stack || err);
  process.exit(1);
});

// The check itself lives in services/db, which is what actually opens the
// connection and therefore cannot be bypassed by importing something else
// first. This file only reports the answer.
const app = express();
const PORT = process.env.PORT || 5000;

// EVERY SESSION AND EVERY AUDIT ROW RECORDED THE PROXY'S ADDRESS. Without this,
// Express's `req.ip` is the socket peer — which behind AWS is the load balancer,
// so all 51 live sessions stored `::1` or `::ffff:127.0.0.1` and the Team
// screen's device list could not tell one office from another continent.
// `x-forwarded-host` and `x-forwarded-proto` were already being read a few
// hundred lines below, so a proxy was assumed everywhere except here.
//
// A HOP COUNT, not `true`. X-Forwarded-For is client-supplied and trusting the
// whole chain lets anyone claim any address — which then lands in the audit
// ledger as fact. `1` means "the single proxy in front of us appended the last
// entry"; raise it only if a second one is genuinely added, and never to `true`.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

// CORS — open to all origins. The frontend (Vercel) and this API (AWS) are on
// different origins, and an allowlist is one more thing that can silently break
// a demo. Default cors() reflects the requested headers, so the custom
// X-Tenant-ID header passes preflight without extra config.
app.use(cors());
// `verify` keeps the raw bytes so a body that fails to parse is still readable
// (see the ingest recovery below). It costs one string per request and is the
// only way to see what a misconfigured provider actually sent.
app.use(express.json({
  limit: '10mb',
  verify: (req: any, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));
app.use(express.urlencoded({ extended: true }));
// text/plain and XML arrive from senders that never set a content-type properly.
// Parsed as text so /ingest can still read them (payloadOf) instead of landing
// an empty object and losing a real enquiry.
app.use(express.text({ type: ['text/*', 'application/xml', 'application/soap+xml'], limit: '10mb' }));

/**
 * A provider sending broken JSON — XML with a JSON content-type, a trailing
 * comma, a truncated body — must not get a 500 with nothing recorded. That is
 * precisely the push the firm needs to look at, and discarding it leaves them
 * debugging against an empty inbox.
 *
 * So for /ingest only: swallow the parse error and let the body through as the
 * raw text it was. It lands in the inbox as unparseable, visibly, and the
 * parser will refuse it later on its own terms.
 */
app.use((err: any, req: Request, _res: Response, next: NextFunction) => {
  const isParseError = err instanceof SyntaxError && 'body' in err;
  if (isParseError && req.path.startsWith('/api/v1/ingest')) {
    req.body = { _unparsed: (req as any).rawBody ?? null, _error: err.message };
    return next();
  }
  return next(err);
});

// Request logger
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', service: 'Real Estate CRM API Engine', timestamp: new Date() });
});

// Per-tenant PWA manifest + icons, served at the site origin (not under /api).
app.use('/pwa', pwaRouter);

// Media download proxy. Deliberately OUTSIDE /api/v1 and unauthenticated: a
// browser sends no Authorization header on <img src>, so access control lives
// in whether the API handed the caller the (128-bit, unguessable) key at all.
// See routes/files.ts for the full reasoning on that tradeoff.
app.use('/files', filesRouter);

// Resolve tenant + actor for EVERY API request and carry it in AsyncLocalStorage
// so the store layer scopes queries by tenant. Must run before all routers.
app.use('/api/v1', withRequestContext);

// ============================================================================
// 🌐 API V1 ROUTER REGISTRATION
// ============================================================================

// 0. Authentication — phone OTP (tenant users) + superadmin password
app.use('/api/v1/auth', authRouter);

// 0b. Superadmin console (Delpat-only, above all tenants)
app.use('/api/v1/admin', adminRouter);

// 0c. Per-user notification feed
app.use('/api/v1/notifications', notificationsRouter);

// 1. Non-Hacky Workspace & Tenant Resolution (Called before & after login!)
// /workspace/integrations is gone with the crm_integrations KV table it read.
app.use('/api/v1/workspace', workspaceRouter);

// 2. Composable Module Metadata & Schema Editor
app.use('/api/v1/modules', modulesRouter);

// 3. Universal Record CRUD Engine (Nested under moduleKey or top level)
app.use('/api/v1/modules/:moduleKey/records', recordsRouter);

// 4. Explicit Coded Domain Workflows & Actions
app.use('/api/v1/leads', leadsRouter);
app.use('/api/v1/owners', ownersRouter);
app.use('/api/v1/properties', propertiesRouter);
app.use('/api/v1/team', teamRouter);

// 5. Universal Record Actions (Bridge, WABA, Stage Change, Merge)
app.use('/api/v1/records', actionsRouter);

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// 5.5 Tenant-based Webhook Documentation Page
app.get('/docs/:tenantSlug', async (req: Request, res: Response) => {
  const tenantSlug = String(req.params.tenantSlug || '').trim();
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

// 6. Idempotent Portal Webhook Ingestion (99acres, MagicBricks, Exotel)
app.use('/api/v1/ingest', ingestRouter);
// Tenant-facing management for those connections (authenticated; /ingest is not).
app.use('/api/v1/connections', connectionsRouter);

// 7. Media uploads — mints presigned PUTs so bytes go browser→R2 directly.
//    Authenticated (unlike the /files read proxy above).
app.use('/api/v1/media', mediaRouter);

// ── Serve the built frontend on the SAME origin as the API + /pwa ───────────
// One HTTPS origin for the whole app is what the service worker and Web Push
// require, and it matches how this deploys. `npm run build` writes ./dist.
const distDir = path.resolve(process.cwd(), 'dist');
app.use(express.static(distDir));
app.use((req: Request, res: Response, next: NextFunction) => {
  // SPA fallback: any non-API GET returns index.html so client routing works.
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/pwa') || req.path === '/health') return next();
  res.sendFile(path.join(distDir, 'index.html'), (err) => { if (err) next(); });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[Unhandled API Error]:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred in the CRM backend engine.',
  });
});

const isMain = process.argv[1] && (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/')) || import.meta.url.includes(process.argv[1].replace(/\\/g, '/')));
if (isMain || process.env.START_SERVER === 'true') {
  const server = app.listen(PORT, () => {
    console.log(`============================================================================`);
    console.log(`🚀 Real Estate CRM Backend API Engine running on port ${PORT}`);
    console.log(`   ${envBanner(PORT)}`);
    console.log(`🌐 Workspace Resolver: http://localhost:${PORT}/api/v1/workspace/resolve?slug=skyline-realty`);
    console.log(`============================================================================`);
    // INSIDE the listen callback, and nowhere else.
    //
    // This ran unconditionally, so a process that lost the port went on
    // sweeping every tenant on its own timer — invisibly, because it printed no
    // banner and served no requests. Four of them were alive on this machine at
    // once, which is how one lead collected two reassignments in the same
    // minute. On a server that is every tenant swept N times per interval by
    // processes nobody knows are running.
    setInterval(() => { runRoutingSweeps().catch(err => console.warn('[Routing Sweep] run failed:', err?.message)); }, 5 * 60 * 1000);
  });
  // And say so, rather than lingering as a process with no port and a timer.
  server.on('error', (err: any) => {
    console.error(err?.code === 'EADDRINUSE'
      ? `\n✗ Port ${PORT} is already in use. Another backend is running — stop it first.\n`
      : `\n✗ Server failed to start: ${err?.message}\n`);
    process.exit(1);
  });
}

export default app;

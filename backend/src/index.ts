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
import { propertiesRouter } from './routes/properties';
import { teamRouter } from './routes/team';
import { actionsRouter } from './routes/actions';
import { ingestRouter } from './routes/ingest';
import { connectionsRouter } from './routes/connections';
import { integrationsRouter } from './routes/integrations';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { notificationsRouter } from './routes/notifications';
import { pwaRouter } from './routes/pwa';
import { filesRouter, mediaRouter } from './routes/files';
import { withRequestContext } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 5000;

// CORS — open to all origins. The frontend (Vercel) and this API (AWS) are on
// different origins, and an allowlist is one more thing that can silently break
// a demo. Default cors() reflects the requested headers, so the custom
// X-Tenant-ID header passes preflight without extra config.
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/v1/workspace/integrations', integrationsRouter);
app.use('/api/v1/workspace', workspaceRouter);

// 2. Composable Module Metadata & Schema Editor
app.use('/api/v1/modules', modulesRouter);

// 3. Universal Record CRUD Engine (Nested under moduleKey or top level)
app.use('/api/v1/modules/:moduleKey/records', recordsRouter);

// 4. Explicit Coded Domain Workflows & Actions
app.use('/api/v1/leads', leadsRouter);
app.use('/api/v1/properties', propertiesRouter);
app.use('/api/v1/team', teamRouter);

// 5. Universal Record Actions (Bridge, WABA, Stage Change, Merge)
app.use('/api/v1/records', actionsRouter);

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
  app.listen(PORT, () => {
    console.log(`============================================================================`);
    console.log(`🚀 Real Estate CRM Backend API Engine running on port ${PORT}`);
    console.log(`🌐 Workspace Resolver: http://localhost:${PORT}/api/v1/workspace/resolve?slug=skyline-realty`);
    console.log(`============================================================================`);
  });
}

export default app;

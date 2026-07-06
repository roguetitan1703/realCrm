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
import { workspaceRouter } from './routes/workspace';
import { modulesRouter } from './routes/modules';
import { recordsRouter } from './routes/records';
import { leadsRouter } from './routes/leads';
import { propertiesRouter } from './routes/properties';
import { teamRouter } from './routes/team';
import { actionsRouter } from './routes/actions';
import { ingestRouter } from './routes/ingest';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
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
  res.status(200).json({ status: 'OK', service: 'Bhumi Propcity CRM API Engine', timestamp: new Date() });
});

// ============================================================================
// 🌐 API V1 ROUTER REGISTRATION
// ============================================================================

// 1. Non-Hacky Workspace & Tenant Resolution (Called before & after login!)
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

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[Unhandled API Error]:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred in the CRM backend engine.',
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`============================================================================`);
    console.log(`🚀 Bhumi Propcity CRM Backend API Engine running on port ${PORT}`);
    console.log(`🌐 Workspace Resolver: http://localhost:${PORT}/api/v1/workspace/resolve?slug=bhumi-propcity`);
    console.log(`============================================================================`);
  });
}

export default app;

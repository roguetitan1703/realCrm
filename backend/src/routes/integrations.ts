/**
 * ============================================================================
 * 🔌 TENANT INTEGRATIONS CONFIGURATION ROUTER
 * ============================================================================
 * Endpoints for managing Exotel API keys, Meta WABA phone IDs, 99acres/MB
 * credentials, and outbound webhook endpoints.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import { TenantIntegrationSchema } from '../models';
import { getIntegrations, updateIntegration } from '../services/store';

export const integrationsRouter = Router();

/**
 * GET /api/v1/workspace/integrations
 * Retrieve all integration settings for tenant workspace
 */
integrationsRouter.get('/', async (req: Request, res: Response) => {
  const integrations = await getIntegrations();
  return res.status(200).json({
    success: true,
    tenant_slug: 'bhumi-propcity',
    integrations,
  });
});

/**
 * PUT /api/v1/workspace/integrations/:provider
 * Save credentials and activate integration
 */
integrationsRouter.put('/:provider', async (req: Request, res: Response) => {
  const { provider } = req.params;
  const config = req.body;

  try {
    const all = await getIntegrations();
    const existing = all[provider] || { status: 'staged' };
    const updated = {
      ...existing,
      ...config,
      status: config.status || 'active',
      last_sync_at: new Date().toISOString(),
    };

    await updateIntegration(provider, updated);
    console.log(`[Integrations API] Updated integration '${provider}' in server store.`);

    return res.status(200).json({
      success: true,
      provider,
      integration: updated,
    });
  } catch (err: any) {
    console.error(`[Integrations API] Error updating ${provider}:`, err.message);
    return res.status(500).json({ error: 'Failed to update integration', message: err.message });
  }
});

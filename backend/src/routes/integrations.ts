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

export const integrationsRouter = Router();

// In-memory mock database of tenant integrations
const tenantIntegrationsStore: Record<string, any> = {
  '99acres': { provider: '99acres', status: 'active', webhook_slug: '99acres', webhook_secret: 'whsec_99acres_prod_882', last_sync_at: new Date().toISOString() },
  'MagicBricks': { provider: 'MagicBricks', status: 'active', webhook_slug: 'magicbricks', webhook_secret: 'whsec_mb_prod_391', last_sync_at: new Date().toISOString() },
  'Calling & SMS': { provider: 'exotel', status: 'active', credentials: { apiKey: 'exo_live_key_992', sid: 'bhumi_sid', callerId: '020-71189900' } },
  'WhatsApp Business API': { provider: 'waba_meta', status: 'staged', credentials: { phoneId: '', accessToken: '', wabaId: '' } },
  'Website sync': { provider: 'website', status: 'active', webhook_slug: 'website', webhook_secret: 'whsec_web_prod_109', last_sync_at: new Date().toISOString() },
};

/**
 * GET /api/v1/workspace/integrations
 * Retrieve all integration settings for tenant workspace
 */
integrationsRouter.get('/', async (req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    tenant_slug: 'bhumi-propcity',
    integrations: tenantIntegrationsStore,
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
    const existing = tenantIntegrationsStore[provider] || { provider, status: 'staged' };
    const updated = {
      ...existing,
      ...config,
      status: 'active',
      last_sync_at: new Date().toISOString(),
    };

    const parseResult = TenantIntegrationSchema.safeParse({
      provider: provider === 'Calling & SMS' ? 'exotel' : provider === 'WhatsApp Business API' ? 'waba_meta' : provider === 'Website sync' ? 'website' : '99acres',
      status: updated.status,
      credentials: updated.credentials || {},
      webhook_slug: updated.webhook_slug,
      webhook_secret: updated.webhook_secret,
    });

    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid integration configuration', details: parseResult.error.format() });
    }

    tenantIntegrationsStore[provider] = updated;
    console.log(`[Integrations API] Updated integration '${provider}' to ACTIVE status.`);

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

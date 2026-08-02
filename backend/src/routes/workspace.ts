/**
 * ============================================================================
 * 🌐 NON-HACKY ENTERPRISE WORKSPACE & TENANT RESOLUTION ROUTER
 * ============================================================================
 * Implements real URL-based multi-tenant resolution:
 * 1. Resolves tenant public branding BEFORE login via subdomain/URL slug so the
 *    login screen renders 100% branded for that real estate firm!
 * 2. Provides the authenticated workspace bootstrap payload containing RBAC-gated
 *    navigation items, custom schemas, and enabled modules after login!
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import { requireTenantAuth } from '../middleware/auth';
import { getPulse, resetDatabase, updateSettings, getSettings, getBrand, updateBrand, getTodayFeed, getBootstrap, searchWorkspace, getDeskSummary, revertImportBatch, checkDuplicates, listContacts } from '../services/store';
import { sql } from '../services/db';
import { getContext } from '../services/context';
import { listAudit, verifyAuditChain } from '../services/audit';

export const workspaceRouter = Router();

/**
 * STORE PWA ICONS — the tenant's home-screen app icons (PNG), generated once
 * client-side (canvas) and stored on the tenant so the manifest serves real
 * rasters (Chrome/Android needs PNG for the installed icon, not just SVG).
 * POST /api/v1/workspace/pwa-icons  { icon192, icon512 }  (base64 data URLs)
 */
workspaceRouter.post('/pwa-icons', async (req: Request, res: Response) => {
  try {
    const tenantId = getContext()?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Authentication required' });
    const { icon192, icon512 } = req.body || {};
    if (!icon192 || !icon512) return res.status(400).json({ error: 'icon192 and icon512 are required' });
    // Guard against oversized payloads (a simple icon is a few KB).
    if (icon192.length > 400_000 || icon512.length > 800_000) {
      return res.status(413).json({ error: 'Icon too large' });
    }
    const patch = { icon192, icon512, iconUpdatedAt: new Date().toISOString() };
    await sql`
      UPDATE tenants SET pwa_config = COALESCE(pwa_config, '{}'::jsonb) || ${sql.json(patch)}
      WHERE id = ${tenantId} OR slug = ${tenantId}
    `;
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to store icons', message: err.message });
  }
});

/**
 * TENANT AUDIT LEDGER (owner/manager only)
 * GET /api/v1/workspace/audit — read-only "who did what, when" for this tenant,
 * plus the tamper-evidence status of the chain.
 */
workspaceRouter.get('/audit', async (req: Request, res: Response) => {
  try {
    const role = getContext()?.role;
    if (role !== 'owner' && role !== 'manager') {
      return res.status(403).json({ error: 'Owner or manager access required' });
    }
    const [entries, chain] = await Promise.all([listAudit(60), verifyAuditChain()]);
    return res.status(200).json({
      success: true,
      entries,
      chain: { ok: chain.ok, brokenAtSeq: chain.brokenAtSeq ?? null },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to load audit ledger', message: err.message });
  }
});

/**
 * 1. PUBLIC TENANT RESOLUTION (Called BEFORE login by the frontend!)
 * GET /api/v1/workspace/resolve
 */
/**
 * GET /api/v1/workspace/today
 * The Today screen's own read: the leads that can appear in one of its groups,
 * plus tenancies inside the renewal window. Replaces scanning every lead and
 * every property in the firm to build one screen.
 */
/**
 * GET /api/v1/workspace/bootstrap
 * Everything the app needs before it can render anything, and nothing else:
 * who you are, the roster, the firm's settings and brand, routing. No leads and
 * no listings — screens read those for themselves, a page at a time.
 *
 */
workspaceRouter.get('/bootstrap', requireTenantAuth, async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({ success: true, state: await getBootstrap() });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to bootstrap', message: err.message });
  }
});

workspaceRouter.get('/today', requireTenantAuth, async (req: Request, res: Response) => {
  try {
    return res.status(200).json({ success: true, ...(await getTodayFeed()) });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to build today', message: err.message });
  }
});

workspaceRouter.get('/search', requireTenantAuth, async (req: Request, res: Response) => {
  try {
    const out = await searchWorkspace(String(req.query.q || ''), Number(req.query.limit) || 8);
    return res.status(200).json({ success: true, ...out });
  } catch (err: any) {
    return res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

workspaceRouter.get('/desk-summary', requireTenantAuth, async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({ success: true, ...(await getDeskSummary()) });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to build desk summary', message: err.message });
  }
});

workspaceRouter.delete('/import-batches/:batchId', requireTenantAuth, async (req: Request, res: Response) => {
  try {
    const out = await revertImportBatch(req.params.batchId);
    return res.status(200).json({ success: true, ...out });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to revert import', message: err.message });
  }
});

workspaceRouter.post('/dedupe-check', requireTenantAuth, async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    return res.status(200).json({ success: true, ...(await checkDuplicates({ phones: b.phones, names: b.names, titles: b.titles })) });
  } catch (err: any) {
    return res.status(500).json({ error: 'Dedupe check failed', message: err.message });
  }
});

workspaceRouter.get('/contacts', requireTenantAuth, async (req: Request, res: Response) => {
  try {
    const q = req.query;
    const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const out = await listContacts({
      tab: str(q.tab), role: str(q.role), q: str(q.q),
      page: Number(q.page) || 1, limit: Number(q.limit) || 25,
    });
    return res.status(200).json({
      success: true, data: out.rows, total: out.total, counts: out.counts,
      page: out.page, limit: out.limit,
      pages: Math.max(1, Math.ceil(out.total / out.limit)),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to list contacts', message: err.message });
  }
});

workspaceRouter.get('/resolve', async (req: Request, res: Response) => {
  const slug = req.query.slug as string;
  const domain = req.query.domain as string;

  console.log(`[Tenant Resolver] Resolving workspace for slug: '${slug}' | domain: '${domain}'`);

  try {
    // Read the REAL tenant row so the login screen themes from the firm's actual
    // brand_config (the same source the desk and PWA icons use), not a hardcoded
    // default. Fall back to the first tenant when no slug is given (single-tenant
    // dev), and 404 on an unknown slug.
    const key = slug || domain || '';
    // Hyphen-insensitive match: "meridianestates" resolves to "meridian-estates"
    // so a firm typed by name lands on its workspace regardless of spacing.
    const bare = key.toLowerCase().replace(/-/g, '');
    const rows = key
      ? await sql`
          SELECT id, name, slug, brand_config, enabled_modules FROM tenants
          WHERE slug = ${key} OR id = ${key}
             OR replace(lower(slug), '-', '') = ${bare}
             OR replace(lower(id), '-', '') = ${bare}
          LIMIT 1`
      : await sql`SELECT id, name, slug, brand_config, enabled_modules FROM tenants ORDER BY created_at ASC LIMIT 1`;
    const t = rows[0];

    if (!t) {
      return res.status(404).json({
        success: false,
        resolved: false,
        error: 'Workspace Not Found',
        message: `No active CRM workspace found matching slug '${slug}' or domain '${domain}'.`,
      });
    }

    const brand = { primaryColor: '#1E6F52', surfaceColor: '#F6F5F2', logoUrl: '', firmName: t.name, ...(t.brand_config || {}) };
    return res.status(200).json({
      success: true,
      resolved: true,
      tenant: {
        id: t.id,
        name: t.name,
        slug: t.slug,
        brand_config: brand,
        enabled_modules: t.enabled_modules || ['leads', 'properties', 'team', 'dialer', 'import', 'whatsapp'],
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Resolution Failed', message: err.message });
  }
});

// Tenant onboarding moved to the SUPERADMIN console: POST /api/v1/admin/onboard
// (guarded by requireSuperadmin). The old public /workspace/onboard route was
// removed so a visitor on the login page can no longer provision workspaces.
// The provisioning engine now lives in services/store.ts → provisionTenant().

// GET /workspace/state is gone. It returned the entire tenant in one response
// -- every lead, every property, every timeline event -- and on a real book that
// was ~10MB, which is a two-second blank screen on a phone and too large to keep
// as an offline snapshot at all. Every screen that used to read it now reads
// what it actually shows: a page, a summary, or one record.

/**
 * GET /api/v1/workspace/pulse
 * A few dozen bytes saying whether this tenant's desk has changed. Polled by
 * every open tab; the screens that are showing something only refetch when the
 * token moves. Never cached — a cached pulse is a pulse that reports nothing
 * ever happens.
 */
import { processScheduledNotifications } from '../services/notifications.js';

workspaceRouter.get('/pulse', async (req: Request, res: Response) => {
  processScheduledNotifications().catch(() => {});
  const pulse = await getPulse();
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ success: true, ...pulse });
});

/**
 * POST /api/v1/workspace/settings
 * Updates workspace settings (firmName, stages, sources, etc.)
 */
workspaceRouter.post('/settings', async (req: Request, res: Response) => {
  const patch = req.body;
  const updated = await updateSettings(patch);
  res.status(200).json({
    success: true,
    settings: updated,
  });
});

/**
 * The /workspace/ingest and /workspace/ingest/regenerate routes are gone with
 * the per-tenant ingest_secret they served. Connections own their own keys now
 * (routes/connections.ts) — one key per provider, rotatable per provider.
 */

/**
 * POST /api/v1/workspace/brand
 * Update the tenant's brand identity (accent colour, logo). Owner/manager only —
 * it changes what every user in the firm sees. Writes tenants.brand_config, the
 * single source the app UI and the PWA icons both read.
 */
workspaceRouter.post('/brand', async (req: Request, res: Response) => {
  try {
    const role = getContext()?.role;
    if (role !== 'owner' && role !== 'manager') {
      return res.status(403).json({ success: false, error: 'Only an owner or manager can change branding.' });
    }
    const { primaryColor, logoUrl, surfaceColor } = req.body || {};
    const patch: any = {};
    if (typeof primaryColor === 'string') patch.primaryColor = primaryColor;
    if (typeof surfaceColor === 'string') patch.surfaceColor = surfaceColor;
    if (typeof logoUrl === 'string') patch.logoUrl = logoUrl;
    const brand = await updateBrand(patch);
    return res.status(200).json({ success: true, brand });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Brand update failed', message: err.message });
  }
});

/**
 * POST /api/v1/workspace/reset
 * Resets and re-seeds the server database to clean default state
 */
workspaceRouter.post('/reset', async (req: Request, res: Response) => {
  const state = await resetDatabase();
  res.status(200).json({
    success: true,
    message: 'Database reset to clean default state successfully.',
    state,
  });
});



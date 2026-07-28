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
import { getState, resetDatabase, updateSettings, getSettings, getBrand, updateBrand, getIngestConfig, regenerateIngestKey, genIngestKey } from '../services/store';
import { sql } from '../services/db';
import { getContext } from '../services/context';
import { listAudit, verifyAuditChain } from '../services/audit';
import { signToken } from '../services/auth';

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
    const rows = key
      ? await sql`SELECT id, name, slug, brand_config, enabled_modules FROM tenants WHERE slug = ${key} OR id = ${key} LIMIT 1`
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

/**
 * 2. WORKSPACE BOOTSTRAP ENDPOINT (Called AFTER login!)
 * GET /api/v1/workspace/bootstrap
 */
workspaceRouter.get('/bootstrap', requireTenantAuth, async (req: Request, res: Response) => {
  const user = req.user!;
  const tenant = req.tenant!;

  console.log(`[Workspace Bootstrap] Initializing workspace for user: '${user.name}' (${user.role})`);

  try {
    const settings = await getSettings();
    const allAvailableNav = [
      { key: 'leads', label: 'Leads Pipeline', icon: 'Users', path: '/leads', is_enabled: true },
      { key: 'properties', label: 'Properties & Inventory', icon: 'Building', path: '/properties', is_enabled: true },
      { key: 'team', label: 'Team Members & Roster', icon: 'UserCheck', path: '/team', is_enabled: true },
      { key: 'dialer', label: 'Telephony & Call Logs', icon: 'PhoneCall', path: '/dialer', is_enabled: true },
      { key: 'import', label: 'Data Ingestion & Imports', icon: 'UploadCloud', path: '/import', is_enabled: true },
      { key: 'settings', label: 'Workspace Settings', icon: 'Settings', path: '/settings', is_enabled: true },
    ];

    let rbacNavItems = [...allAvailableNav];
    if (user.role === 'SALES_EXECUTIVE') {
      rbacNavItems = allAvailableNav.filter((item) => ['leads', 'properties'].includes(item.key));
    } else if (user.role === 'SALES_MANAGER') {
      rbacNavItems = allAvailableNav.filter((item) => ['leads', 'properties', 'team'].includes(item.key));
    }

    const defaultStages = settings.stages || [
      { id: '11111111-1111-1111-1111-111111111101', key: 'new', name: 'New Inquiry', color: '#3B82F6', order_index: 1 },
      { id: '11111111-1111-1111-1111-111111111102', key: 'contacted', name: 'Contacted', color: '#8B5CF6', order_index: 2 },
      { id: '11111111-1111-1111-1111-111111111103', key: 'visit_scheduled', name: 'Site Visit Scheduled', color: '#F59E0B', order_index: 3 },
      { id: '11111111-1111-1111-1111-111111111104', key: 'visit_done', name: 'Site Visit Done', color: '#10B981', order_index: 4 },
      { id: '11111111-1111-1111-1111-111111111106', key: 'won', name: 'Closed Won', color: '#059669', order_index: 6, is_closed: true },
    ];

    const modulesConfig = settings.modules_config || {
      leads: {
        stages: defaultStages,
        customFields: settings.custom_fields?.leads || [
          { field_key: 'budget_range', field_label: 'Budget Range', field_type: 'select', options: ['Under 50 Lakhs', '50 Lakhs - 1 Cr', '1 Cr - 1.5 Cr', '1.5 Cr - 2.5 Cr', '2.5 Cr+'], is_required: false },
          { field_key: 'vastu_preference', field_label: 'Vastu Preference', field_type: 'select', options: ['East Facing', 'North Facing', 'North-East', 'Any'], is_required: false },
          { field_key: 'property_type', field_label: 'Property Type Interested', field_type: 'select', options: ['2 BHK', '3 BHK', '4 BHK / Penthouse', 'Commercial Office', 'Plot / Land'], is_required: true },
        ],
      },
      properties: {
        customFields: settings.custom_fields?.properties || [
          { field_key: 'rera_no', field_label: 'RERA Registration No.', field_type: 'text', is_required: true },
          { field_key: 'possession_status', field_label: 'Possession Status', field_type: 'select', options: ['Ready to Move', 'Under Construction (2026)', 'New Launch'], is_required: true },
        ],
      },
    };

    return res.status(200).json({
      success: true,
      timestamp: new Date(),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        branch_location: user.branch_location,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        brand_config: tenant.brand_config,
        subscription_plan: tenant.subscription_plan,
      },
      rbac_nav_items: rbacNavItems,
      modules_config: modulesConfig,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Bootstrap Failed', message: err.message });
  }
});

/**
 * 3. TENANT ONBOARDING & INITIALIZATION ENGINE
 * POST /api/v1/workspace/onboard
 *
 * Provisions a brand new Indian real estate brokerage workspace:
 * 1. Creates tenant branding & subdomain slug resolution.
 * 2. Initializes the 12 core real estate modules (Leads, Properties, Team, Telephony, etc.).
 * 3. Seeds Maharashtra/India RERA default pipeline stages & custom property attributes.
 * 4. Returns the full bootstrap payload to log the user straight into their new desk!
 */
workspaceRouter.post('/onboard', async (req: Request, res: Response) => {
  const { firmName, city, slug, adminName, adminEmail, adminPhone, primaryColor } = req.body;
  console.log(`[Tenant Onboard] Provisioning workspace for '${firmName}' (${city})`);

  try {
    if (!firmName || !city) {
      return res.status(400).json({ success: false, error: 'Missing Required Fields', message: 'Firm name and city are required.' });
    }
    // The owner needs a way to sign in — OTP goes to a phone or an email.
    const ownerPhoneRaw = adminPhone ? String(adminPhone).replace(/\D/g, '') : '';
    const ownerPhone = ownerPhoneRaw ? `+91${ownerPhoneRaw.slice(-10)}` : null;
    const ownerEmail = adminEmail ? String(adminEmail).trim().toLowerCase() : null;
    if (!ownerPhone && !ownerEmail) {
      return res.status(400).json({ success: false, error: 'Owner contact required', message: "Provide the owner's phone or email so they can sign in." });
    }

    // Unique slug === tenant id (our convention). If taken, suffix -2, -3, …
    const base = (slug || firmName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
    let cleanSlug = base;
    for (let n = 2; (await sql`SELECT 1 FROM tenants WHERE id = ${cleanSlug} OR slug = ${cleanSlug} LIMIT 1`).length; n++) {
      cleanSlug = `${base}-${n}`;
    }
    const tenantId = cleanSlug;
    const initials = firmName.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
    const brand_config = {
      primaryColor: primaryColor || '#1E6F52',
      surfaceColor: '#F6F5F2',
      city,
      logoUrl: '',
      firmName,
      initials,
    };
    const ingestSecret = genIngestKey();

    // 1. The tenant row — the real anchor every tenant-scoped row hangs off.
    await sql`
      INSERT INTO tenants (id, name, slug, brand_config, ingest_secret, subscription_plan, subscription_status)
      VALUES (${tenantId}, ${firmName}, ${cleanSlug}, ${sql.json(brand_config)}, ${ingestSecret}, 'PRO', 'ACTIVE')
    `;

    // 2. The owner — a login-capable user (OTP) + a roster mirror so the desk
    //    and lead-assignment reads see them. Both under the NEW tenant.
    const ownerId = `owner_${tenantId}`;
    const ownerName = (adminName || 'Owner').trim();
    const ownerMeta = { initials, avatar: '', phone: ownerPhone, email: ownerEmail };
    await sql`
      INSERT INTO users (id, tenant_id, name, phone, email, role, status, metadata)
      VALUES (${ownerId}, ${tenantId}, ${ownerName}, ${ownerPhone}, ${ownerEmail}, 'owner', 'ACTIVE', ${sql.json(ownerMeta)})
    `;
    await sql`
      INSERT INTO crm_agents (id, name, first, initials, avatar, role, duty_status, metadata, tenant_id)
      VALUES (${ownerId}, ${ownerName}, ${ownerName.split(' ')[0]}, ${initials}, '', 'owner', 'ACTIVE', ${sql.json(ownerMeta)}, ${tenantId})
    `;

    // 3. Default settings + routing for the NEW tenant (NOT via tid(), which is
    //    the requester's context). A new firm starts EMPTY — no demo leads.
    const settings = {
      firmName, city,
      stages: ['New', 'Contacted', 'Site Visit', 'Negotiation', 'Closed Won', 'Closed Lost'],
      sources: ['99acres', 'MagicBricks', 'Walk-in', 'Referral', 'Website'],
    };
    await sql`
      INSERT INTO crm_settings (key, value, tenant_id) VALUES ('default', ${sql.json(settings)}, ${tenantId})
      ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value
    `;
    await sql`
      INSERT INTO crm_routing_rules (strategy, active_agent_ids, last_assigned_index, tenant_id)
      VALUES ('round_robin', ${sql.json([ownerId])}, -1, ${tenantId})
      ON CONFLICT (tenant_id) DO NOTHING
    `;

    // Sign the owner straight in — provisioning yields a real session, so the
    // operator lands in the new desk authenticated (no fake logged-in state).
    const token = signToken({ kind: 'user', tenant_id: tenantId, user_id: ownerId, role: 'owner' });

    console.log(`[Tenant Onboard] Provisioned '${firmName}' as '${tenantId}' (owner ${ownerId}).`);
    return res.status(201).json({
      success: true,
      message: `Workspace '${firmName}' provisioned.`,
      tenant: { id: tenantId, name: firmName, slug: cleanSlug, brand_config },
      owner: { id: ownerId, name: ownerName, phone: ownerPhone, email: ownerEmail, role: 'owner' },
      ingest: { tenantSlug: cleanSlug, secret: ingestSecret },
      loginWith: ownerEmail || ownerPhone,
      token,
    });
  } catch (err: any) {
    console.error('[Tenant Onboard] Failed:', err.message);
    return res.status(500).json({ success: false, error: 'Tenant Provisioning Failed', message: err.message });
  }
});

/**
 * GET /api/v1/workspace/state
 * Returns full seeded workspace state from server store
 */
workspaceRouter.get('/state', async (req: Request, res: Response) => {
  const state = await getState();
  res.status(200).json({
    success: true,
    state,
  });
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
 * GET /api/v1/workspace/ingest — the tenant's lead-ingest key + slug, so the UI
 * can show the real push URL to paste into 99acres/MagicBricks/website.
 */
workspaceRouter.get('/ingest', async (_req: Request, res: Response) => {
  try {
    const cfg = await getIngestConfig();
    return res.status(200).json({ success: true, ...cfg });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Failed to load ingest config', message: err.message });
  }
});

/** POST /api/v1/workspace/ingest/regenerate — rotate the key (owner/manager). */
workspaceRouter.post('/ingest/regenerate', async (_req: Request, res: Response) => {
  try {
    const role = getContext()?.role;
    if (role !== 'owner' && role !== 'manager') {
      return res.status(403).json({ success: false, error: 'Only an owner or manager can rotate the ingest key.' });
    }
    const cfg = await regenerateIngestKey();
    return res.status(200).json({ success: true, ...cfg });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Failed to rotate ingest key', message: err.message });
  }
});

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



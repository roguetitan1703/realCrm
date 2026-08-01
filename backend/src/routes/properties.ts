/**
 * ============================================================================
 * 🏢 CODED DOMAIN ROUTER: PROPERTIES & INVENTORY UNIT WORKFLOWS
 * ============================================================================
 * Where does property-specific code live? RIGHT HERE IN TYPESCRIPT!
 * Handles inventory unit grouping, double-booking prevention row locking,
 * unit releasing, and brochure link generation.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import { requireTenantAuth } from '../middleware/auth';
import {
  createProperty, getUnits, blockUnit, releaseUnit,
  listProperties, getPropertyById, getPropertiesSummary,
  listProjects, getProject, getPropertyBuyers,
} from '../services/store';
import { canEditListing } from '../lib/permissions';

export const propertiesRouter = Router();
propertiesRouter.use(requireTenantAuth);

/**
 * 1. ONE PAGE OF LISTINGS
 * GET /api/v1/properties?page=&limit=&q=&status=&deal=&type=&locality=&project=
 *
 * Paged and filtered in Postgres. This route used to read every listing in the
 * firm and filter the array in Node, which is the same mistake getState() made
 * and the reason a launch shipped ~10MB.
 */
propertiesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const q = req.query;
    const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const { rows, total, page, limit } = await listProperties({
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 50,
      q: str(q.q),
      status: str(q.status),
      deal: str(q.deal),
      type: str(q.type),
      locality: str(q.locality),
      project: str(q.project),
      excludeId: str(q.excludeId),
    });
    return res.status(200).json({
      success: true, data: rows, total, page, limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      count: rows.length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch properties', message: err.message });
  }
});

/**
 * 1b. COUNTS AND FILTER OPTIONS
 * GET /api/v1/properties/summary
 * The stat strip and the filter menus, without reading the listings themselves.
 * Declared before /:id so 'summary' is never taken for an id.
 */
propertiesRouter.get('/summary', async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({ success: true, summary: await getPropertiesSummary() });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to summarise properties', message: err.message });
  }
});

/**
 * 1d. PROJECTS — the township grouping, aggregated in SQL.
 * GET /api/v1/properties/projects
 * GET /api/v1/properties/projects/:key   (header row; units come from ?project=)
 * Both declared before /:id so 'projects' is never taken for an id.
 */
propertiesRouter.get('/projects', async (req: Request, res: Response) => {
  try {
    const { rows, total } = await listProjects({
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      limit: Number(req.query.limit) || 200,
    });
    return res.status(200).json({ success: true, data: rows, total });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to list projects', message: err.message });
  }
});

propertiesRouter.get('/projects/:key', async (req: Request, res: Response) => {
  try {
    const project = await getProject(req.params.key);
    if (!project) return res.status(404).json({ success: false, error: 'Not found' });
    return res.status(200).json({ success: true, project });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch project', message: err.message });
  }
});

/**
 * 1e. THE BUYERS FOR ONE LISTING
 * GET /api/v1/properties/:id/buyers
 * `leadsForProperty(p, allLeads)` on the desk needed every lead in memory to
 * answer a question about one flat. Same match, run where the leads are.
 */
propertiesRouter.get('/:id/buyers', async (req: Request, res: Response) => {
  try {
    const buyers = await getPropertyBuyers(req.params.id, Number(req.query.limit) || 50);
    return res.status(200).json({ success: true, buyers, total: buyers.length });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch buyers', message: err.message });
  }
});

/**
 * 1c. ONE LISTING, IN FULL
 * GET /api/v1/properties/:id
 * The detail screen's own read. Everything that used to do
 * `state.properties.find(p => p.id === id)` over the whole book comes here.
 */
propertiesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const p = await getPropertyById(req.params.id);
    if (!p) return res.status(404).json({ success: false, error: 'Not found' });
    return res.status(200).json({ success: true, property: p });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch property', message: err.message });
  }
});

/**
 * 2. CREATE NEW PROPERTY INVENTORY ITEM
 * POST /api/v1/properties
 */
propertiesRouter.post('/', async (req: Request, res: Response) => {
  if (!canEditListing(req.user?.role)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Only an owner or manager can add a listing.', code: 'ROLE_REQUIRED' });
  }
  try {
    const body = req.body || {};

    // `type` is the LEGACY conflated field ("3 BHK Apartment") that block C
    // split into bhk + subtype. The new form doesn't send it, so derive a
    // display string from the canonical fields instead of demanding a value we
    // are retiring — several list views still render p.type verbatim.
    if (!body.type && (body.bhk || body.subtype)) {
      const bhkLabel = body.bhk === '1rk' ? '1 RK'
        : body.bhk === '5plus' ? '5+ BHK'
        : body.bhk ? `${body.bhk} BHK` : '';
      const subLabel = body.subtype
        ? String(body.subtype).split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : '';
      body.type = [bhkLabel, subLabel].filter(Boolean).join(' ').trim();
    }
    // A title is likewise optional now — the society/project plus the unit is
    // what a broker actually calls a listing.
    if (!body.title) {
      body.title = [body.society || body.project, body.unit || body.flat].filter(Boolean).join(' - ')
        || body.type || 'Untitled property';
    }
    if (!body.type) {
      return res.status(400).json({ error: 'Validation Error', message: 'A property type or configuration is required' });
    }

    // Pass the full record through. createProperty folds flat domain fields
    // (deal, society, project, wing, flat, carpet, owner, priceLabel, …) into the
    // config JSONB, and rowToProperty spreads them back on read — so bulk unit
    // creation round-trips every field, not just the 7 first-class columns.
    const newProperty = await createProperty(body, {
      actorType: 'user', actorId: req.user?.id ?? null, actorLabel: req.user?.name ?? null,
      ip: req.ip || req.socket?.remoteAddress || null, userAgent: (req.headers['user-agent'] as string) || null,
    });
    return res.status(201).json({ success: true, data: newProperty });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create property', message: err.message });
  }
});

/**
 * 1. FETCH INVENTORY UNITS FOR A PROJECT (Coded grouping logic)
 * GET /api/v1/properties/:id/units
 */
propertiesRouter.get('/:id/units', async (req: Request, res: Response) => {
  try {
    const propertyId = req.params.id;
    console.log(`[Properties Router] Fetching inventory units for Project ${propertyId}`);

    const units = await getUnits(propertyId);

    return res.status(200).json({
      success: true,
      property_id: propertyId,
      units_count: units.length,
      units,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Fetch Units Failed', message: err.message });
  }
});

/**
 * 2. BLOCK INVENTORY UNIT ACTION (Coded double-booking DB row lock safety check)
 * POST /api/v1/properties/:id/units/:unitId/actions/block
 */
propertiesRouter.post('/:id/units/:unitId/actions/block', async (req: Request, res: Response) => {
  try {
    const { id: propertyId, unitId } = req.params;
    const { buyer_name, lead_id, block_duration_hours = 48 } = req.body;

    console.log(`[Properties Router - Block Unit] Attempting to block Unit ${unitId} for buyer ${buyer_name}`);

    const result = await blockUnit(unitId, buyer_name || 'Anonymous Buyer', block_duration_hours);
    if (!result.success) {
      return res.status(409).json({
        error: result.error || 'Double-Booking Conflict',
        message: result.message || 'This unit was just blocked or sold by another sales agent!',
      });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      blocked_until: result.blocked_until,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Block Unit Failed', message: err.message });
  }
});

/**
 * 3. RELEASE INVENTORY UNIT ACTION
 * POST /api/v1/properties/:id/units/:unitId/actions/release
 */
propertiesRouter.post('/:id/units/:unitId/actions/release', async (req: Request, res: Response) => {
  try {
    const { unitId } = req.params;
    console.log(`[Properties Router - Release Unit] Releasing Unit ${unitId} back to Available`);

    const result = await releaseUnit(unitId);
    if (!result.success) {
      return res.status(404).json({ error: 'Release Unit Failed', message: result.error });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Release Unit Failed', message: err.message });
  }
});

/**
 * 4. GENERATE TRACKED BROCHURE LINK ACTION
 * POST /api/v1/properties/:id/actions/generate-brochure
 */
propertiesRouter.post('/:id/actions/generate-brochure', async (req: Request, res: Response) => {
  try {
    const propertyId = req.params.id;
    const { lead_id, agent_id } = req.body;

    const trackingCode = `brochure_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const trackedUrl = `https://skylinerealty.in/view-brochure/${trackingCode}`;

    console.log(`[Properties Router - Brochure] Generated tracked link for Project ${propertyId}: ${trackedUrl}`);

    return res.status(200).json({
      success: true,
      message: 'Tracked brochure link generated. When buyer clicks, timeline event will be logged automatically.',
      tracked_url: trackedUrl,
      expires_in_days: 30,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Brochure Generation Failed', message: err.message });
  }
});

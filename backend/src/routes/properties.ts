/**
 * ============================================================================
 * 🏢 CODED DOMAIN ROUTER: PROPERTIES & INVENTORY UNIT WORKFLOWS
 * ============================================================================
 * Where does property-specific code live? RIGHT HERE IN TYPESCRIPT!
 * Handles inventory unit grouping, double-booking prevention row locking,
 * unit releasing, and brochure link generation.
 * ============================================================================
 */

import { phoneInvalidBody } from '../services/phone';
import { Router, Request, Response } from 'express';
import { requireTenantAuth } from '../middleware/auth';
import { prepareListing, localeOf,
  createProperty, getUnits,
  listProperties, getPropertyById, getPropertiesSummary, getPropertyTabs,
  listProjects, getProject, getPropertyBuyers,
  setPropertyVerified, setPropertyGallery, setCatalogue,
} from '../services/store';
import { canAddListing, canEditListing, isDeskRole } from '../lib/permissions';

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
// The list's filters, read once for the list and for its tab counts, so the
// two cannot be asked different questions.
const listOpts = (q: any) => {
  const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return {
    q: str(q.q),
    status: str(q.status),
    deal: str(q.deal),
    type: str(q.type),
    locality: str(q.locality),
    project: str(q.project),
    category: str(q.category),
    bhk: str(q.bhk),
    subtype: str(q.subtype),
    furnishing: str(q.furnishing),
    facing: str(q.facing),
    possession: str(q.possession),
    ownership: str(q.ownership),
    transaction: str(q.transaction),
    verified: str(q.verified),
    media: str(q.media),
    tower: str(q.tower),
    excludeId: str(q.excludeId),
    // Whose listings, by owner record — see listProperties.
    ownerId: str(q.ownerId),
    tab: str(q.tab),
    unit: str(q.unit),
    // yes | no — in the public catalogue.
    catalogue: str(q.catalogue),
  };
};

propertiesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const q = req.query;
    const { rows, total, page, limit } = await listProperties({
      ...listOpts(q), page: Number(q.page) || 1, limit: Number(q.limit) || 50,
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
/** GET /api/v1/properties/tabs — the tab row's counts for the list's filters. */
propertiesRouter.get('/tabs', async (req: Request, res: Response) => {
  try {
    return res.status(200).json({ success: true, tabs: await getPropertyTabs(listOpts(req.query)) });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to count properties', message: err.message });
  }
});

propertiesRouter.get('/summary', async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({ success: true, summary: await getPropertiesSummary() });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to summarise properties', message: err.message });
  }
});

/**
 * SHOW IN CATALOGUE, for a selection (listing-pages.md §A.5)
 * POST /api/v1/properties/catalogue { ids, on } → { changed, withoutPhotos }
 * Owners and managers only (store.ts assertCatalogueRole): the catalogue is
 * what the firm shows the public. The single-listing form is the `inCatalogue`
 * field on the ordinary update, held to the same rule.
 */
propertiesRouter.post('/catalogue', async (req: Request, res: Response) => {
  if (!isDeskRole(req.user?.role)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Only an owner or a manager can change what is in the catalogue.', code: 'ROLE_REQUIRED' });
  }
  const { ids, on } = req.body || {};
  if (!Array.isArray(ids) || !ids.length || typeof on !== 'boolean') {
    return res.status(400).json({ error: 'Pick at least one listing, and say on or off.' });
  }
  try {
    const out = await setCatalogue(ids.map(String), on, {
      actorType: 'user', actorId: req.user?.id ?? null, actorLabel: null,
      ip: req.ip || req.socket?.remoteAddress || null, userAgent: (req.headers['user-agent'] as string) || null,
    });
    return res.status(200).json({ success: true, ...out });
  } catch (err: any) {
    return res.status(500).json({ error: 'Could not change the catalogue', message: err.message });
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

const actor = (req: Request) => ({
  actorType: 'user' as const, actorId: req.user?.id ?? null, actorLabel: req.user?.name ?? null,
  ip: req.ip || req.socket?.remoteAddress || null, userAgent: (req.headers['user-agent'] as string) || null,
});

/**
 * 7.1 VERIFIED ON A VISIT — POST /properties/:id/verify { on: boolean }
 * Not a status: a listing can be Available and not yet checked.
 */
propertiesRouter.post('/:id/verify', async (req: Request, res: Response) => {
  if (!canEditListing(req.user?.role)) return res.status(422).json({ error: 'Not allowed', message: 'Sign in to change a listing.' });
  try {
    const p = await setPropertyVerified(req.params.id, req.body?.on !== false, actor(req));
    if (!p) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true, property: p });
  } catch (err: any) {
    return res.status(500).json({ error: 'Could not save', message: err.message });
  }
});

/**
 * 7.5 THE PHOTO LINK — POST /properties/:id/gallery { action: 'off' | 'on' | 'new' }
 * 'new' replaces the link; anyone holding the old one sees nothing.
 */
propertiesRouter.post('/:id/gallery', async (req: Request, res: Response) => {
  const action = req.body?.action;
  if (!['off', 'on', 'new'].includes(action)) return res.status(400).json({ error: 'action must be off, on or new' });
  if (!canEditListing(req.user?.role)) return res.status(422).json({ error: 'Not allowed', message: 'Sign in to change a listing.' });
  try {
    // A LINK TO NOTHING IS NOT A LINK. Turning it on with no photos wrote
    // "Turned on" into the listing's history and told the person it was made,
    // while the listing still had no link to copy.
    if (action !== 'off') {
      const cur = await getPropertyById(req.params.id);
      if (!cur) return res.status(404).json({ error: 'Not found' });
      if (!(cur.media || []).length) return res.status(422).json({ error: 'No photos', message: 'Add a photo first.' });
    }
    const p = await setPropertyGallery(req.params.id, action, actor(req));
    if (!p) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true, property: p });
  } catch (err: any) {
    return res.status(500).json({ error: 'Could not save', message: err.message });
  }
});

/**
 * 2. CREATE NEW PROPERTY INVENTORY ITEM
 * POST /api/v1/properties
 */
propertiesRouter.post('/', async (req: Request, res: Response) => {
  // Adding, not editing — see canAddListing(). Every signed-in employee may put
  // a listing on the book; changing a live one stays with the desk.
  if (!canAddListing(req.user?.role)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Sign in to add a listing.', code: 'ROLE_REQUIRED' });
  }
  try {
    const body = req.body || {};

    prepareListing(body, await localeOf(req.tenantId!));
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
    const pi = phoneInvalidBody(err); if (pi) return res.status(422).json(pi);
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
 * Unit block/release and a "tracked brochure link" lived here. Nothing in the
 * app called them; block and release rewrote a unit's status with no role
 * check or history, and the brochure route answered with a link on a demo
 * domain that tracked nothing. Removed.
 */

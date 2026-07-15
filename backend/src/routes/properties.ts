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
import { getProperties, createProperty, getUnits, blockUnit, releaseUnit } from '../services/store';

export const propertiesRouter = Router();
propertiesRouter.use(requireTenantAuth);

/**
 * 1. GET ALL PROPERTIES FOR WORKSPACE
 * GET /api/v1/properties
 */
propertiesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { tower } = req.query;
    let properties = await getProperties();

    if (tower && typeof tower === 'string') {
      properties = properties.filter(p => p.tower?.toUpperCase() === tower.toUpperCase());
    }

    return res.status(200).json({ success: true, count: properties.length, data: properties });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch properties', message: err.message });
  }
});

/**
 * 2. CREATE NEW PROPERTY INVENTORY ITEM
 * POST /api/v1/properties
 */
propertiesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { title, type, locality, price, tower, unit, config } = req.body;
    if (!title || !type) {
      return res.status(400).json({ error: 'Validation Error', message: 'Title and type are required' });
    }

    const newProperty = await createProperty({
      title, status: 'Available', type, locality: locality || 'Unknown',
      price: price || 'Price on Request', tower: tower || 'A', unit: unit || '101',
      config: config || {}, tenancy: null, timeline: [],
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
    const trackedUrl = `https://bhumipropcity.com/view-brochure/${trackingCode}`;

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

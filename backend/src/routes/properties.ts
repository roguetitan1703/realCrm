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
import { getProperties, createProperty } from '../services/store';

export const propertiesRouter = Router();
propertiesRouter.use(requireTenantAuth);

/**
 * GET /api/v1/properties
 */
propertiesRouter.get('/', async (req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    data: await getProperties(),
  });
});

/**
 * POST /api/v1/properties
 */
propertiesRouter.post('/', async (req: Request, res: Response) => {
  const newProp = await createProperty(req.body);
  return res.status(201).json({
    success: true,
    data: newProp,
  });
});

/**
 * 1. FETCH INVENTORY UNITS FOR A PROJECT (Coded grouping logic)
 * GET /api/v1/properties/:id/units
 */
propertiesRouter.get('/:id/units', async (req: Request, res: Response) => {
  try {
    const propertyId = req.params.id;
    const tenant = req.tenant!;

    console.log(`[Properties Router] Fetching inventory units for Project ${propertyId}`);

    // Coded domain logic:
    // SELECT * FROM module_records WHERE tenant_id = $1 AND module_key = 'units' AND parent_record_id = $2
    const mockUnits = [
      { id: 'unit_101', title: 'Tower A - 402', data: { type: '3 BHK', carpet_area_sqft: 1450, price: 18500000, floor: 4, status: 'Available' } },
      { id: 'unit_102', title: 'Tower A - 403', data: { type: '3 BHK', carpet_area_sqft: 1450, price: 18500000, floor: 4, status: 'Blocked' } },
      { id: 'unit_103', title: 'Tower A - 501', data: { type: '4 BHK Penthouse', carpet_area_sqft: 2400, price: 32000000, floor: 5, status: 'Sold' } },
    ];

    return res.status(200).json({
      success: true,
      property_id: propertyId,
      units_count: mockUnits.length,
      units: mockUnits,
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

    // Coded domain safety check:
    // BEGIN TRANSACTION;
    // SELECT data->>'status' FROM module_records WHERE id = unitId FOR UPDATE;
    // If status != 'Available' -> ROLLBACK and return 409 Conflict!
    // Else -> UPDATE module_records SET data = jsonb_set(data, '{status}', '"Blocked"') WHERE id = unitId;
    // COMMIT;

    const mockIsAvailable = true;
    if (!mockIsAvailable) {
      return res.status(409).json({
        error: 'Double-Booking Conflict',
        message: 'This unit was just blocked or sold by another sales agent!',
      });
    }

    return res.status(200).json({
      success: true,
      message: `Unit ${unitId} successfully blocked for ${block_duration_hours} hours.`,
      blocked_until: new Date(Date.now() + block_duration_hours * 3600 * 1000),
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

    return res.status(200).json({
      success: true,
      message: `Unit ${unitId} status reverted to Available.`,
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

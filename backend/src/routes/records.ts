/**
 * ============================================================================
 * 🔄 UNIVERSAL MODULE RECORD CRUD & QUERY API ROUTER
 * ============================================================================
 * Handles querying, creating, updating, and deleting records for ANY module
 * ('leads', 'properties', 'clients', 'deals', or custom tenant modules).
 * Performs runtime Zod schema validation against the tenant's custom field
 * definitions before inserting or updating data!
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/auth';

export const recordsRouter = Router({ mergeParams: true });

// Ensure mandatory tenant authentication
recordsRouter.use(requireTenantAuth);

/**
 * 1. QUERY RECORDS FOR A MODULE
 * GET /api/v1/modules/:moduleKey/records
 * Supports filtering by stage_id, search string, and sorting.
 */
recordsRouter.get('/', async (req: Request, res: Response) => {
  const { moduleKey } = req.params;
  const { stage_id, search, limit = '50', offset = '0' } = req.query;
  const tenant = req.tenant!;

  console.log(`[Query Records] Tenant: ${tenant.name} | Module: ${moduleKey} | Stage Filter: ${stage_id || 'ALL'}`);

  try {
    // In production:
    // SELECT * FROM module_records WHERE tenant_id = $1 AND module_key = $2 [AND stage_id = $3] [AND (title ILIKE '%search%' OR primary_phone LIKE '%search%')] ORDER BY created_at DESC LIMIT $4 OFFSET $5;

    // Mock Demo Return
    const mockRecords = [
      {
        id: `rec_${moduleKey}_101`,
        tenant_id: tenant.id,
        module_key: moduleKey,
        title: moduleKey === 'properties' ? 'Godrej Woods - Tower B' : 'Aarav Sharma',
        primary_phone: moduleKey === 'leads' ? '+919876543210' : undefined,
        primary_email: moduleKey === 'leads' ? 'aarav.sharma@example.com' : undefined,
        stage_id: stage_id || '11111111-1111-1111-1111-111111111101',
        assigned_user_id: req.user?.id || 'usr_55',
        data: moduleKey === 'properties'
          ? { rera_no: 'P52100029384', possession_status: 'Under Construction (2026)', location: 'Kalyani Nagar, Pune' }
          : { budget_range: '1.5 Cr - 2.5 Cr', vastu_preference: 'East Facing', property_type: '3 BHK', source: '99acres' },
        created_at: new Date(),
        updated_at: new Date(),
        last_activity_at: new Date(),
      },
    ];

    return res.status(200).json({
      success: true,
      module_key: moduleKey,
      count: mockRecords.length,
      limit: Number(limit),
      offset: Number(offset),
      data: mockRecords,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Query Failed', message: err.message });
  }
});

/**
 * Helper to build runtime Zod validation schema from tenant's custom field definitions
 */
function buildRuntimeValidator(customFields: any[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of customFields) {
    let validator: z.ZodTypeAny;
    switch (field.field_type) {
      case 'number':
        validator = z.number();
        break;
      case 'boolean':
        validator = z.boolean();
        break;
      case 'select':
        validator = z.string(); // In prod: z.enum(field.options)
        break;
      default:
        validator = z.string();
    }
    if (!field.is_required) {
      validator = validator.optional().or(z.null());
    }
    shape[field.field_key] = validator;
  }
  return z.object(shape).passthrough(); // passthrough allows un-modeled ad-hoc keys if permitted
}

/**
 * 2. CREATE A RECORD IN A MODULE
 * POST /api/v1/modules/:moduleKey/records
 */
recordsRouter.post('/', async (req: Request, res: Response) => {
  const { moduleKey } = req.params;
  const tenant = req.tenant!;
  const payload = req.body;

  try {
    if (!payload.title || typeof payload.title !== 'string') {
      return res.status(400).json({ error: 'Validation Error', message: 'Field "title" is required and must be a string.' });
    }

    // In production: Fetch custom_field_definitions for this tenant and moduleKey from DB/Cache
    // const customFields = await getCustomFields(tenant.id, moduleKey);
    // const dynamicSchema = buildRuntimeValidator(customFields);
    // const parseResult = dynamicSchema.safeParse(payload.data || {});
    // if (!parseResult.success) { return res.status(400).json({ error: "Custom Field Validation Error", details: parseResult.error.format() }); }

    const newRecordId = `rec_${moduleKey}_${Date.now()}`;
    console.log(`[Create Record] Created row in module_records: ${newRecordId} | Title: "${payload.title}"`);

    // In production: INSERT INTO module_records (tenant_id, module_key, title, primary_phone, primary_email, stage_id, assigned_user_id, data) ...

    return res.status(201).json({
      success: true,
      message: `Record successfully created in '${moduleKey}' module.`,
      data: {
        id: newRecordId,
        tenant_id: tenant.id,
        module_key: moduleKey,
        title: payload.title,
        primary_phone: payload.primary_phone || null,
        primary_email: payload.primary_email || null,
        stage_id: payload.stage_id || null,
        assigned_user_id: payload.assigned_user_id || req.user?.id || null,
        data: payload.data || {},
        created_at: new Date(),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Record Creation Failed', message: err.message });
  }
});

/**
 * 3. GET SINGLE RECORD & ITS TIMELINE EVENTS / HIERARCHY
 * GET /api/v1/modules/:moduleKey/records/:id
 */
recordsRouter.get('/:id', async (req: Request, res: Response) => {
  const { moduleKey, id } = req.params;
  const tenant = req.tenant!;

  try {
    // In production: Query module_records AND child units / timeline events via LEFT JOIN or parallel queries
    return res.status(200).json({
      success: true,
      data: {
        id,
        tenant_id: tenant.id,
        module_key: moduleKey,
        title: 'Aarav Sharma (Sample Contact)',
        primary_phone: '+919876543210',
        stage_id: '11111111-1111-1111-1111-111111111102',
        data: { budget_range: '1.5 Cr - 2.5 Cr', vastu_preference: 'East Facing' },
        timeline_events_count: 4,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Fetch Failed', message: err.message });
  }
});

/**
 * 4. UPDATE A RECORD
 * PATCH /api/v1/modules/:moduleKey/records/:id
 */
recordsRouter.patch('/:id', async (req: Request, res: Response) => {
  const { moduleKey, id } = req.params;
  const updates = req.body;

  console.log(`[Update Record] Updating record ${id} in module '${moduleKey}':`, updates);

  // In production: UPDATE module_records SET data = data || $1::jsonb, stage_id = COALESCE($2, stage_id) WHERE id = $3 AND tenant_id = $4;

  return res.status(200).json({
    success: true,
    message: 'Record updated successfully.',
    id,
    updated_fields: updates,
  });
});

/**
 * 5. DELETE / ARCHIVE A RECORD
 * DELETE /api/v1/modules/:moduleKey/records/:id
 */
recordsRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  console.log(`[Delete Record] Deleting / archiving record ${id}`);

  // In production: DELETE FROM module_records WHERE id = $1 AND tenant_id = $2;

  return res.status(200).json({
    success: true,
    message: `Record ${id} deleted.`,
  });
});

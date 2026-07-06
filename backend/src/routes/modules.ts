/**
 * ============================================================================
 * 🧩 COMPOSABLE MODULE CONFIGURATION & METADATA ROUTER
 * ============================================================================
 * Enables the React frontend to dynamically load Kanban pipeline columns,
 * filter bars, and modal form fields without hardcoding UI schemas! Also allows
 * workspace admins to create custom modules and custom form fields on the fly.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import { CreateModuleSchema, CreateCustomFieldSchema } from '../models';
import { requireTenantAuth } from '../middleware/auth';

export const modulesRouter = Router();

// Ensure mandatory tenant authentication
modulesRouter.use(requireTenantAuth);

/**
 * 1. FETCH FULL MODULE CONFIGURATION (Stages + Custom Fields)
 * GET /api/v1/modules/:moduleKey/config
 * The frontend fetches this once when opening a module tab (e.g. Leads or Loans)
 * to render Kanban columns, table headers, and form inputs dynamically!
 */
modulesRouter.get('/:moduleKey/config', async (req: Request, res: Response) => {
  const { moduleKey } = req.params;
  const tenant = req.tenant!;

  console.log(`[Fetch Module Config] Tenant: ${tenant.name} | Module: ${moduleKey}`);

  try {
    // In production:
    // 1. SELECT * FROM modules WHERE tenant_id = $1 AND key = $2
    // 2. SELECT * FROM pipeline_stages WHERE tenant_id = $1 AND module_key = $2 ORDER BY order_index ASC
    // 3. SELECT * FROM custom_field_definitions WHERE tenant_id = $1 AND module_key = $2

    // Mock Demo Config Return for 'leads'
    const mockStages = [
      { id: '11111111-1111-1111-1111-111111111101', key: 'new', name: 'New Inquiry', color: '#3B82F6', order_index: 1 },
      { id: '11111111-1111-1111-1111-111111111102', key: 'contacted', name: 'Contacted', color: '#8B5CF6', order_index: 2 },
      { id: '11111111-1111-1111-1111-111111111103', key: 'visit_scheduled', name: 'Site Visit Scheduled', color: '#F59E0B', order_index: 3 },
      { id: '11111111-1111-1111-1111-111111111104', key: 'visit_done', name: 'Site Visit Done', color: '#10B981', order_index: 4 },
      { id: '11111111-1111-1111-1111-111111111106', key: 'won', name: 'Closed Won', color: '#059669', order_index: 6, is_closed: true },
    ];

    const mockCustomFields = [
      { id: 'cf_1', field_key: 'budget_range', field_label: 'Budget Range', field_type: 'select', options: ['Under 50 Lakhs', '50 Lakhs - 1 Cr', '1 Cr - 1.5 Cr', '1.5 Cr - 2.5 Cr', '2.5 Cr+'], is_required: false, is_filterable: true },
      { id: 'cf_2', field_key: 'vastu_preference', field_label: 'Vastu Preference', field_type: 'select', options: ['East Facing', 'North Facing', 'North-East', 'Any'], is_required: false, is_filterable: true },
      { id: 'cf_3', field_key: 'property_type', field_label: 'Property Type Interested', field_type: 'select', options: ['2 BHK', '3 BHK', '4 BHK / Penthouse', 'Commercial Office', 'Plot / Land'], is_required: true, is_filterable: true },
    ];

    return res.status(200).json({
      success: true,
      module: {
        key: moduleKey,
        name: moduleKey === 'leads' ? 'Leads' : 'Properties & Projects',
        icon: moduleKey === 'leads' ? 'Users' : 'Building',
        config: { supports_pipeline: true, supports_custom_fields: true, default_view: 'kanban' },
      },
      pipeline_stages: mockStages,
      custom_field_definitions: mockCustomFields,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch module config', message: err.message });
  }
});

/**
 * 2. CREATE A NEW CUSTOM MODULE
 * POST /api/v1/modules
 * Admin clicks "+ Add Module" in Settings (e.g. "Lease Agreements" or "Loans")
 */
modulesRouter.post('/', async (req: Request, res: Response) => {
  const tenant = req.tenant!;
  const parseResult = CreateModuleSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({ error: 'Validation Error', details: parseResult.error.format() });
  }

  const { key, name, icon, supports_pipeline, default_view } = parseResult.data;

  console.log(`[Create Module] Tenant ${tenant.name} creating custom module: '${key}' (${name})`);

  // In production: INSERT INTO modules (tenant_id, key, name, icon, is_system, config) ...
  // If supports_pipeline == true -> Automatically seed default pipeline_stages for this new module!

  return res.status(201).json({
    success: true,
    message: `Custom module '${name}' created successfully! It is immediately ready for use.`,
    module: {
      id: `mod_${key}_${Date.now()}`,
      tenant_id: tenant.id,
      key,
      name,
      icon,
      is_system: false,
      config: { supports_pipeline, supports_custom_fields: true, default_view },
    },
  });
});

/**
 * 3. ADD A DYNAMIC CUSTOM FIELD TO A MODULE
 * POST /api/v1/modules/:moduleKey/fields
 * Admin adds a new field in Settings (e.g. "Security Deposit Amount" as number)
 */
modulesRouter.post('/:moduleKey/fields', async (req: Request, res: Response) => {
  const { moduleKey } = req.params;
  const tenant = req.tenant!;
  const parseResult = CreateCustomFieldSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({ error: 'Validation Error', details: parseResult.error.format() });
  }

  const fieldDef = parseResult.data;

  console.log(`[Add Custom Field] Adding field '${fieldDef.field_key}' (${fieldDef.field_label}) to module '${moduleKey}'`);

  // In production: INSERT INTO custom_field_definitions (tenant_id, module_key, field_key, field_label, field_type, options, is_required, is_filterable) ...

  return res.status(201).json({
    success: true,
    message: `Custom field '${fieldDef.field_label}' added to '${moduleKey}' module.`,
    custom_field: {
      id: `cf_${Date.now()}`,
      tenant_id: tenant.id,
      module_key: moduleKey,
      ...fieldDef,
    },
  });
});

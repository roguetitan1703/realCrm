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
import { getSettings, updateSettings } from '../services/store';

export const modulesRouter = Router();

// Ensure mandatory tenant authentication
modulesRouter.use(requireTenantAuth);

/**
 * 1. FETCH FULL MODULE CONFIGURATION (Stages + Custom Fields)
 * GET /api/v1/modules/:moduleKey/config
 */
modulesRouter.get('/:moduleKey/config', async (req: Request, res: Response) => {
  const { moduleKey } = req.params;
  const tenant = req.tenant!;

  console.log(`[Fetch Module Config] Tenant: ${tenant.name} | Module: ${moduleKey}`);

  try {
    const settings = await getSettings();
    const stages = settings.stages || [
      { id: '11111111-1111-1111-1111-111111111101', key: 'new', name: 'New Inquiry', color: '#3B82F6', order_index: 1 },
      { id: '11111111-1111-1111-1111-111111111102', key: 'contacted', name: 'Contacted', color: '#8B5CF6', order_index: 2 },
      { id: '11111111-1111-1111-1111-111111111103', key: 'visit_scheduled', name: 'Site Visit Scheduled', color: '#F59E0B', order_index: 3 },
      { id: '11111111-1111-1111-1111-111111111104', key: 'visit_done', name: 'Site Visit Done', color: '#10B981', order_index: 4 },
      { id: '11111111-1111-1111-1111-111111111106', key: 'won', name: 'Closed Won', color: '#059669', order_index: 6, is_closed: true },
    ];

    const customFieldsMap = settings.custom_fields || {
      leads: [
        { id: 'cf_1', field_key: 'budget_range', field_label: 'Budget Range', field_type: 'select', options: ['Under 50 Lakhs', '50 Lakhs - 1 Cr', '1 Cr - 1.5 Cr', '1.5 Cr - 2.5 Cr', '2.5 Cr+'], is_required: false, is_filterable: true },
        { id: 'cf_2', field_key: 'vastu_preference', field_label: 'Vastu Preference', field_type: 'select', options: ['East Facing', 'North Facing', 'North-East', 'Any'], is_required: false, is_filterable: true },
        { id: 'cf_3', field_key: 'property_type', field_label: 'Property Type Interested', field_type: 'select', options: ['2 BHK', '3 BHK', '4 BHK / Penthouse', 'Commercial Office', 'Plot / Land'], is_required: true, is_filterable: true },
      ],
      properties: [
        { id: 'cf_p1', field_key: 'rera_no', field_label: 'RERA Registration No.', field_type: 'text', is_required: true, is_filterable: true },
        { id: 'cf_p2', field_key: 'possession_status', field_label: 'Possession Status', field_type: 'select', options: ['Ready to Move', 'Under Construction (2026)', 'New Launch'], is_required: true, is_filterable: true },
      ],
    };

    const customFields = customFieldsMap[moduleKey] || [];
    const customModules = settings.custom_modules || [];
    const matchedModule = customModules.find((m: any) => m.key === moduleKey);

    return res.status(200).json({
      success: true,
      module: matchedModule || {
        key: moduleKey,
        name: moduleKey === 'leads' ? 'Leads' : 'Properties & Projects',
        icon: moduleKey === 'leads' ? 'Users' : 'Building',
        config: { supports_pipeline: true, supports_custom_fields: true, default_view: 'kanban' },
      },
      pipeline_stages: stages,
      custom_field_definitions: customFields,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch module config', message: err.message });
  }
});

/**
 * 2. CREATE A NEW CUSTOM MODULE
 * POST /api/v1/modules
 */
modulesRouter.post('/', async (req: Request, res: Response) => {
  const tenant = req.tenant!;
  const parseResult = CreateModuleSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({ error: 'Validation Error', details: parseResult.error.format() });
  }

  const { key, name, icon, supports_pipeline, default_view } = parseResult.data;
  console.log(`[Create Module] Tenant ${tenant.name} creating custom module: '${key}' (${name})`);

  try {
    const settings = await getSettings();
    const customModules = settings.custom_modules || [];
    const newMod = {
      id: `mod_${key}_${Date.now()}`,
      tenant_id: tenant.id,
      key,
      name,
      icon,
      is_system: false,
      config: { supports_pipeline, supports_custom_fields: true, default_view },
    };
    customModules.push(newMod);
    await updateSettings({ ...settings, custom_modules: customModules });

    return res.status(201).json({
      success: true,
      message: `Custom module '${name}' created successfully! It is immediately ready for use.`,
      module: newMod,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create custom module', message: err.message });
  }
});

/**
 * 3. ADD A DYNAMIC CUSTOM FIELD TO A MODULE
 * POST /api/v1/modules/:moduleKey/fields
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

  try {
    const settings = await getSettings();
    const customFieldsMap = settings.custom_fields || {};
    const moduleFields = customFieldsMap[moduleKey] || [];
    const newField = {
      id: `cf_${Date.now()}`,
      tenant_id: tenant.id,
      module_key: moduleKey,
      ...fieldDef,
    };
    moduleFields.push(newField);
    customFieldsMap[moduleKey] = moduleFields;
    await updateSettings({ ...settings, custom_fields: customFieldsMap });

    return res.status(201).json({
      success: true,
      message: `Custom field '${fieldDef.field_label}' added to '${moduleKey}' module.`,
      custom_field: newField,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to add custom field', message: err.message });
  }
});

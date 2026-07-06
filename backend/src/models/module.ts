/**
 * ============================================================================
 * 🧩 COMPOSABLE MODULE SCHEMA & DYNAMIC CUSTOM FIELD CONTRACTS
 * ============================================================================
 * Defines the core metadata engine that allows tenants to declare custom modules
 * (e.g., Loan Applications, Site Visits), custom pipeline columns, and custom
 * form fields without altering database SQL tables.
 * ============================================================================
 */

import { z } from 'zod';

/**
 * Explicit Module Registry Entity
 * Allows tenants to register custom modules alongside system defaults ('leads', 'properties').
 */
export interface Module {
  id: string;
  tenant_id: string;
  key: string; // e.g., 'leads', 'properties', 'loan_applications', 'legal_docs'
  name: string; // e.g., 'Loan Applications'
  icon: string; // e.g., 'Banknote', 'FileText'
  is_system: boolean; // true for core CRM modules, false for tenant-created modules
  config: {
    supports_pipeline: boolean;
    supports_custom_fields: boolean;
    default_view: 'kanban' | 'table' | 'grid';
  };
  created_at: Date;
}

export interface PipelineStage {
  id: string;
  tenant_id: string;
  module_key: string; // Points to Module.key ('leads', 'loan_applications')
  name: string;
  key: string;
  color: string;
  order_index: number;
  is_default: boolean;
  is_closed: boolean;
}

export interface CustomFieldDefinition {
  id: string;
  tenant_id: string;
  module_key: string; // Points to Module.key
  field_key: string; // e.g., 'budget_range', 'vastu', 'bank_name'
  field_label: string;
  field_type: 'text' | 'number' | 'select' | 'date' | 'boolean';
  options?: string[]; // Dropdown options for 'select' type
  is_required: boolean;
  is_filterable: boolean;
}

/**
 * Generic Module Record Entity
 * Stores arbitrary records for custom tenant modules (like 'Loan Applications')
 * inside a unified PostgreSQL table using JSONB custom_data!
 */
export interface ModuleRecord {
  id: string;
  tenant_id: string;
  module_key: string;
  title: string; // Primary identifier (e.g., "HDFC Loan #1092 - Aarav Sharma")
  stage_id?: string;
  assigned_user_id?: string;
  custom_data: Record<string, any>; // Dynamic custom fields stored in GIN indexed JSONB
  created_at: Date;
  updated_at: Date;
}

/**
 * Zod Schema for declaring a new custom module
 * POST /api/v1/modules
 */
export const CreateModuleSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/, "Key must be lowercase alphanumeric with underscores"),
  name: z.string().min(2, "Module name required"),
  icon: z.string().default("Folder"),
  supports_pipeline: z.boolean().default(true),
  default_view: z.enum(["kanban", "table", "grid"]).default("kanban"),
});
export type CreateModulePayload = z.infer<typeof CreateModuleSchema>;

/**
 * Zod Schema for declaring a new custom field on any module
 * POST /api/v1/modules/:moduleKey/fields
 */
export const CreateCustomFieldSchema = z.object({
  field_key: z.string().regex(/^[a-z0-9_]+$/, "Field key must be lowercase with underscores"),
  field_label: z.string().min(2),
  field_type: z.enum(["text", "number", "select", "date", "boolean"]),
  options: z.array(z.string()).default([]),
  is_required: z.boolean().default(false),
  is_filterable: z.boolean().default(true),
});
export type CreateCustomFieldPayload = z.infer<typeof CreateCustomFieldSchema>;

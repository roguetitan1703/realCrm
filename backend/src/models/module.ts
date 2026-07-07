/**
 * ============================================================================
 * 🧩 PURE COMPOSABLE UNIVERSAL RECORD ENGINE
 * ============================================================================
 * Defines the core metadata engine where NO MODULE IS HARDCODED as an SQL table.
 * Leads, Properties, Clients, Deals, and Units are dynamically declared in
 * `Module` and all records live in `ModuleRecord` with GIN indexed JSONB!
 * ============================================================================
 */

import { z } from 'zod';

export interface Module {
  id: string;
  tenant_id: string;
  key: string; // 'leads', 'properties', 'clients', 'deals', 'units'
  name: string; // 'Leads', 'Properties', 'Clients'
  icon: string;
  is_system: boolean; // true for default templates, false for tenant custom modules
  config: {
    supports_pipeline: boolean;
    supports_custom_fields: boolean;
    default_view: 'kanban' | 'table' | 'grid';
    title_field: string;
  };
  created_at?: Date;
}

export interface PipelineStage {
  id: string;
  tenant_id: string;
  module_key: string; // Points to Module.key
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
  field_key: string; // e.g., 'budget', 'vastu', 'rera_no', 'company_name'
  field_label: string;
  field_type: 'text' | 'number' | 'select' | 'date' | 'phone' | 'email' | 'boolean';
  options?: string[];
  is_required: boolean;
  is_filterable: boolean;
}

/**
 * THE UNIVERSAL RECORD ENTITY
 * All CRM entities (Leads, Properties, Clients, Deals) are stored here!
 */
export interface ModuleRecord {
  id: string;
  tenant_id: string;
  module_key: string; // Distinguishes 'leads' vs 'properties' vs 'clients'
  parent_record_id?: string; // Links Units to Properties, or Deals to Clients
  title: string; // Display title (e.g., "Aarav Sharma" or "Godrej Woods Tower B")
  primary_phone?: string; // B-Tree indexed for Exotel Click-to-Call & WhatsApp matching!
  primary_email?: string; // B-Tree indexed for instant deduplication!
  stage_id?: string;
  assigned_user_id?: string;
  data: Record<string, any>; // Holds ALL dynamic fields: {"budget": 15000000, "vastu": "East"}
  created_at: Date;
  updated_at: Date;
  last_activity_at: Date;
}

// ============================================================================
// SHARED ACTION PAYLOAD SCHEMAS (CONTRACT-DRIVEN ZERO BACKLOG TESTING)
// ============================================================================

/**
 * Payload schema for triggering Click-to-Call on ANY record with primary_phone
 * POST /api/v1/records/:id/actions/call
 */
export const CallActionSchema = z.object({
  agent_id: z.string().min(1, "Agent ID required"),
  record_call: z.boolean().default(true),
  custom_metadata: z.record(z.any()).optional(),
});
export type CallActionPayload = z.infer<typeof CallActionSchema>;

/**
 * Payload schema for sending WhatsApp Business template to ANY record with primary_phone
 * POST /api/v1/records/:id/actions/whatsapp
 */
export const WhatsAppActionSchema = z.object({
  template_id: z.string().min(1, "Template ID required"),
  variables: z.array(z.string()).default([]),
  media_url: z.string().url().optional(),
});
export type WhatsAppActionPayload = z.infer<typeof WhatsAppActionSchema>;

/**
 * Payload schema for updating Kanban stage on ANY record
 * POST /api/v1/records/:id/actions/stage-change
 */
export const StageChangeSchema = z.object({
  new_stage_id: z.string().min(1, "Stage ID required"),
  note: z.string().min(3, "Mandatory stage change note must be at least 3 characters"),
});
export type StageChangePayload = z.infer<typeof StageChangeSchema>;

/**
 * Payload schema for merging duplicate records
 * POST /api/v1/records/:id/actions/merge
 */
export const MergeSchema = z.object({
  duplicate_record_id: z.string().min(1, "Duplicate Record ID required"),
  merge_strategy: z.enum(["keep_primary", "keep_newest"]).default("keep_primary"),
});
export type MergePayload = z.infer<typeof MergeSchema>;

/**
 * Payload schema for portal webhook lead ingestion
 * POST /api/v1/ingest/:tenantSlug/:sourceKey
 */
export const WebhookIngestSchema = z.object({
  external_id: z.string().min(1, "External ID required for idempotency"),
  name: z.string().min(1, "Title / Name required"),
  phone: z.string().min(10, "Valid Phone Number required"),
  email: z.string().email().optional().or(z.literal('')),
  module_target: z.string().default("leads"),
  custom_attributes: z.record(z.any()).default({}),
});
export type WebhookIngestPayload = z.infer<typeof WebhookIngestSchema>;

export const CreateModuleSchema = z.object({
  key: z.string().min(2, "Module key required (e.g., 'loans')"),
  name: z.string().min(2, "Module display name required (e.g., 'Home Loans')"),
  icon: z.string().default("folder"),
  config: z.object({
    supports_pipeline: z.boolean().default(true),
    supports_custom_fields: z.boolean().default(true),
    default_view: z.enum(["kanban", "table", "grid"]).default("kanban"),
    title_field: z.string().default("title")
  }).optional()
});
export type CreateModulePayload = z.infer<typeof CreateModuleSchema>;

export const CreateCustomFieldSchema = z.object({
  field_key: z.string().min(2, "Field key required"),
  field_label: z.string().min(2, "Field label required"),
  field_type: z.enum(["text", "number", "select", "date", "phone", "email", "boolean"]).default("text"),
  options: z.array(z.string()).optional(),
  is_required: z.boolean().default(false),
  is_filterable: z.boolean().default(true)
});
export type CreateCustomFieldPayload = z.infer<typeof CreateCustomFieldSchema>;

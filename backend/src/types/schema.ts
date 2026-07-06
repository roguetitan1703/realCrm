/**
 * ============================================================================
 * 🏗️ BHUMI PROPCITY CRM — TYPESCRIPT DOMAIN CONTRACTS & API SCHEMAS
 * ============================================================================
 * Defines the strict Zod / TypeScript schemas for multi-tenant database records
 * and action-oriented REST API endpoints.
 * ============================================================================
 */

import { z } from 'zod';

// ============================================================================
// 1. DATABASE ENTITY INTERFACES
// ============================================================================

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  brand_config: {
    primaryColor: string;
    surfaceColor: string;
    city: string;
    logoUrl?: string;
  };
  enabled_modules: string[];
  subscription_plan: 'STARTER' | 'PRO' | 'ENTERPRISE';
  subscription_status: 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELLED';
  usage_limits: {
    max_agents: number;
    whatsapp_credits_limit: number;
    whatsapp_credits_used: number;
    call_minutes_limit: number;
    call_minutes_used: number;
  };
  created_at: Date;
  updated_at: Date;
}

export interface TenantIntegration {
  id: string;
  tenant_id: string;
  provider: 'exotel' | 'knowlarity' | 'waba_meta' | '99acres' | 'magicbricks' | 'google_calendar';
  status: 'ACTIVE' | 'DISABLED' | 'ERROR';
  credentials: Record<string, string>; // Decrypted runtime credentials
  webhook_slug?: string;
  webhook_secret?: string;
}

export interface User {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  phone_number: string;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'TEAM_LEAD' | 'FIELD_AGENT';
  reports_to_user_id?: string;
  branch_location: string;
  status: 'ACTIVE' | 'ON_LEAVE' | 'OFFLINE';
}

export interface PipelineStage {
  id: string;
  tenant_id: string;
  module_key: 'leads' | 'properties' | 'deals';
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
  module_key: 'leads' | 'properties';
  field_key: string;
  field_label: string;
  field_type: 'text' | 'number' | 'select' | 'date' | 'boolean';
  options?: string[];
  is_required: boolean;
  is_filterable: boolean;
}

export interface Lead {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  email?: string;
  stage_id?: string;
  assigned_user_id?: string;
  source: string;
  budget?: number;
  location_preference?: string;
  project_id_interested?: string;
  custom_data: Record<string, any>; // Dynamic tenant custom fields
  created_at: Date;
  updated_at: Date;
  last_activity_at: Date;
}

export interface PropertyUnit {
  id: string;
  tenant_id: string;
  property_id: string;
  unit_number: string;
  type: string;
  price: number;
  carpet_area_sqft?: number;
  status: 'Available' | 'Blocked' | 'Under Offer' | 'Sold';
  custom_data: Record<string, any>;
}

export interface TimelineEvent {
  id: string;
  tenant_id: string;
  lead_id?: string;
  user_id?: string;
  event_type: 'note' | 'call' | 'wa_sent' | 'wa_received' | 'stage_change' | 'portal_re_inquiry' | 'system_merge';
  content: string;
  metadata: Record<string, any>;
  created_at: Date;
}

// ============================================================================
// 2. API ACTION PAYLOAD SCHEMAS (ZOD VALIDATORS)
// ============================================================================

/**
 * Payload schema for triggering Exotel Click-to-Call 2-leg bridge
 * POST /api/v1/leads/:id/actions/call
 */
export const CallActionSchema = z.object({
  agent_id: z.string().uuid("Invalid Agent UUID"),
  record_call: z.boolean().default(true),
  custom_metadata: z.record(z.any()).optional(),
});
export type CallActionPayload = z.infer<typeof CallActionSchema>;

/**
 * Payload schema for dispatching outbound WhatsApp Business template message
 * POST /api/v1/leads/:id/actions/whatsapp
 */
export const WhatsAppActionSchema = z.object({
  template_id: z.string().min(1, "Template ID is required"),
  variables: z.array(z.string()).default([]),
  media_url: z.string().url("Invalid Media URL").optional(),
});
export type WhatsAppActionPayload = z.infer<typeof WhatsAppActionSchema>;

/**
 * Payload schema for updating lead stage and logging mandatory audit note
 * POST /api/v1/leads/:id/actions/stage-change
 */
export const StageChangeSchema = z.object({
  new_stage_id: z.string().uuid("Invalid Stage UUID"),
  note: z.string().min(3, "Mandatory stage change note must be at least 3 characters"),
  notify_assigned_agent: z.boolean().default(true),
});
export type StageChangePayload = z.infer<typeof StageChangeSchema>;

/**
 * Payload schema for merging duplicate leads
 * POST /api/v1/leads/:id/actions/merge
 */
export const MergeSchema = z.object({
  duplicate_lead_id: z.string().uuid("Invalid Duplicate Lead UUID"),
  merge_strategy: z.enum(["keep_primary", "keep_newest", "manual_override"]).default("keep_primary"),
  reassign_timeline: z.boolean().default(true),
  archive_duplicate: z.boolean().default(true),
});
export type MergePayload = z.infer<typeof MergeSchema>;

/**
 * Payload schema for portal webhook lead ingestion
 * POST /api/v1/ingest/:tenantSlug/:sourceKey
 */
export const WebhookIngestSchema = z.object({
  external_id: z.string().min(1, "External Lead ID required for idempotency"),
  name: z.string().min(1, "Buyer Name required"),
  phone: z.string().min(10, "Valid Phone Number required"),
  email: z.string().email().optional().or(z.literal('')),
  project_interested: z.string().optional(),
  budget: z.number().positive().optional(),
  custom_attributes: z.record(z.any()).default({}),
  raw_payload: z.record(z.any()).optional(),
});
export type WebhookIngestPayload = z.infer<typeof WebhookIngestSchema>;

// ============================================================================
// 3. TENANT ONBOARDING PROVISIONING SCHEMA
// ============================================================================

/**
 * Payload schema for provisioning a new tenant workspace
 * POST /api/super/tenants/provision
 */
export const TenantProvisionSchema = z.object({
  firm_name: z.string().min(2, "Firm name must be at least 2 characters"),
  slug: z.string().regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  admin_name: z.string().min(2),
  admin_email: z.string().email(),
  admin_phone: z.string().min(10),
  city: z.string().min(2),
  subscription_plan: z.enum(["STARTER", "PRO", "ENTERPRISE"]).default("PRO"),
  seed_default_templates: z.boolean().default(true),
});
export type TenantProvisionPayload = z.infer<typeof TenantProvisionSchema>;

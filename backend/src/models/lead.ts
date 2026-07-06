/**
 * ============================================================================
 * 💼 LEAD MODEL DEFINITIONS & ACTION PAYLOAD SCHEMAS
 * ============================================================================
 * Represents prospective buyer inquiries. Why are base fields fixed?
 * Standard columns (phone, email, stage_id) are required for high-speed SQL
 * deduplication, indexing, and joins. Dynamic tenant fields are merged into
 * custom_data (JSONB).
 * ============================================================================
 */

import { z } from 'zod';

export interface Lead {
  id: string;
  tenant_id: string;
  name: string;
  phone: string; // Indexed primary contact identifier for deduplication
  email?: string;
  stage_id?: string;
  assigned_user_id?: string;
  source: string; // '99acres', 'MagicBricks', 'Walk-in', 'Meta Ads'
  budget?: number;
  location_preference?: string;
  project_id_interested?: string;
  custom_data: Record<string, any>; // Stores tenant custom fields: {"vastu": "East"}
  created_at: Date;
  updated_at: Date;
  last_activity_at: Date;
}

// ============================================================================
// ACTION PAYLOAD SCHEMAS (SHARED WITH FRONTEND FOR ZERO-BACKLOG TESTING)
// ============================================================================

/**
 * Payload schema for triggering Exotel Click-to-Call 2-leg bridge
 * POST /api/v1/leads/:id/actions/call
 */
export const CallActionSchema = z.object({
  agent_id: z.string().min(1, "Agent ID required"),
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
  new_stage_id: z.string().min(1, "Stage ID required"),
  note: z.string().min(3, "Mandatory stage change note must be at least 3 characters"),
  notify_assigned_agent: z.boolean().default(true),
});
export type StageChangePayload = z.infer<typeof StageChangeSchema>;

/**
 * Payload schema for merging duplicate leads
 * POST /api/v1/leads/:id/actions/merge
 */
export const MergeSchema = z.object({
  duplicate_lead_id: z.string().min(1, "Duplicate Lead ID required"),
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

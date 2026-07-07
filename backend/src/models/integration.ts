/**
 * ============================================================================
 * 🔌 INTEGRATION & WEBHOOK SCHEMA DEFINITIONS
 * ============================================================================
 * Single Source of Truth (SSOT) for tenant channel integrations, inbound/outbound
 * webhook validation, HMAC signing secrets, and async job payloads.
 * ============================================================================
 */

import { z } from 'zod';

export const IntegrationProviderSchema = z.enum([
  'exotel',
  'waba_meta',
  '99acres',
  'magicbricks',
  'website',
  'webhook_outbound'
]);
export type IntegrationProvider = z.infer<typeof IntegrationProviderSchema>;

export const IntegrationStatusSchema = z.enum([
  'active',
  'disabled',
  'error',
  'staged'
]);
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

/**
 * Tenant Integration Configuration Record
 * Stored in database per tenant workspace
 */
export const TenantIntegrationSchema = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
  provider: IntegrationProviderSchema,
  status: IntegrationStatusSchema.default('staged'),
  credentials: z.record(z.any()).default({}),
  webhook_slug: z.string().optional(),
  webhook_secret: z.string().optional(),
  last_sync_at: z.string().optional(),
  error_message: z.string().optional(),
});
export type TenantIntegration = z.infer<typeof TenantIntegrationSchema>;

/**
 * Outbound Webhook Event Payload
 * Dispatched to client ERPs/Zapier when domain events trigger
 */
export const OutboundWebhookPayloadSchema = z.object({
  event_id: z.string().uuid(),
  event_type: z.enum([
    'LEAD_CREATED',
    'LEAD_STAGE_CHANGED',
    'VISIT_SCHEDULED',
    'TOKEN_RECEIVED',
    'CALL_COMPLETED',
    'LEAD_MERGED'
  ]),
  tenant_slug: z.string(),
  timestamp: z.string().datetime(),
  data: z.record(z.any()),
});
export type OutboundWebhookPayload = z.infer<typeof OutboundWebhookPayloadSchema>;

/**
 * Async Job Queue Payload
 */
export const QueueJobPayloadSchema = z.object({
  job_id: z.string(),
  queue_name: z.enum([
    'webhook-ingest',
    'outgoing-webhooks',
    'waba-messages',
    'bulk-import'
  ]),
  attempt: z.number().default(1),
  max_attempts: z.number().default(5),
  payload: z.record(z.any()),
  created_at: z.string().datetime(),
});
export type QueueJobPayload = z.infer<typeof QueueJobPayloadSchema>;

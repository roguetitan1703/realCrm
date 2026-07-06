/**
 * ============================================================================
 * 🏢 TENANT & INTEGRATION MODEL DEFINITIONS
 * ============================================================================
 * Represents multi-tenant workspace configurations, subscription billing limits,
 * and encrypted third-party integration credentials (Exotel, Meta WABA, Portals).
 * ============================================================================
 */

import { z } from 'zod';

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

/**
 * Zod Schema for onboarding / provisioning a new tenant workspace
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

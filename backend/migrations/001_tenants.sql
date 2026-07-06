-- ============================================================================
-- 001_TENANTS.SQL — Workspace & Integration Configurations
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    brand_config JSONB DEFAULT '{"primaryColor": "#1E6F52", "surfaceColor": "#F6F5F2", "city": "Pune"}'::jsonb,
    enabled_modules JSONB DEFAULT '["leads", "properties", "team", "dialer", "import", "whatsapp"]'::jsonb,
    subscription_plan VARCHAR(50) DEFAULT 'PRO',
    subscription_status VARCHAR(50) DEFAULT 'ACTIVE',
    usage_limits JSONB DEFAULT '{"max_agents": 25, "whatsapp_credits_limit": 10000, "whatsapp_credits_used": 0, "call_minutes_limit": 5000, "call_minutes_used": 0}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

CREATE TABLE IF NOT EXISTS tenant_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider VARCHAR(100) NOT NULL, -- 'exotel', 'waba_meta', '99acres', 'magicbricks', 'google_calendar'
    status VARCHAR(50) DEFAULT 'ACTIVE',
    credentials JSONB NOT NULL, -- AES-256 encrypted secrets
    webhook_slug VARCHAR(255),
    webhook_secret VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_tenant_id ON tenant_integrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_integrations_provider ON tenant_integrations(tenant_id, provider);

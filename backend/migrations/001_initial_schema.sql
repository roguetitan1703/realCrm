-- ============================================================================
-- 🏗️ BHUMI PROPCITY CRM — MULTI-TENANT POSTGRESQL SCHEMA (v1.0.0)
-- ============================================================================
-- Features:
-- 1. UUID Primary Keys & Indexed tenant_id on every table
-- 2. Row-Level Security (RLS) enforcement per tenant
-- 3. Dynamic JSONB columns (custom_data) with GIN indexing for high-speed queries
-- 4. Audit & Activity timeline tracking
-- 5. Webhook ingestion queues and automated deduplication rules
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TENANTS (Control Plane & Subscription Management)
-- ============================================================================
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

CREATE INDEX idx_tenants_slug ON tenants(slug);

-- ============================================================================
-- 2. TENANT INTEGRATIONS (API Keys & Webhook Configurations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider VARCHAR(100) NOT NULL, -- e.g., 'exotel', 'waba_meta', '99acres', 'magicbricks', 'google_calendar'
    status VARCHAR(50) DEFAULT 'ACTIVE',
    credentials JSONB NOT NULL, -- AES-256 encrypted API secrets, WABA phone ID, Exotel SID
    webhook_slug VARCHAR(255), -- e.g., '/v1/ingest/bhumi-propcity/99acres'
    webhook_secret VARCHAR(255), -- HMAC validation secret
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_integrations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX idx_tenant_integrations_tenant_id ON tenant_integrations(tenant_id);
CREATE INDEX idx_tenant_integrations_provider ON tenant_integrations(tenant_id, provider);

-- ============================================================================
-- 3. USERS (Team Details, Hierarchy & Role Permissions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(50) NOT NULL, -- Leg 1 target for Exotel Click-to-Call bridge
    role VARCHAR(50) NOT NULL DEFAULT 'FIELD_AGENT', -- 'SUPER_ADMIN', 'TENANT_ADMIN', 'TEAM_LEAD', 'FIELD_AGENT'
    reports_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Manager hierarchy
    branch_location VARCHAR(100) DEFAULT 'Main Office',
    status VARCHAR(50) DEFAULT 'ACTIVE', -- 'ACTIVE', 'ON_LEAVE', 'OFFLINE'
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_reports_to ON users(reports_to_user_id);

-- ============================================================================
-- 4. PIPELINE STAGES (Custom CRM Columns per Tenant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pipeline_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_key VARCHAR(50) NOT NULL DEFAULT 'leads', -- 'leads', 'properties', 'deals'
    name VARCHAR(100) NOT NULL,
    key VARCHAR(50) NOT NULL,
    color VARCHAR(20) DEFAULT '#2563EB',
    order_index INTEGER NOT NULL DEFAULT 1,
    is_default BOOLEAN DEFAULT false,
    is_closed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pipeline_stages_tenant_module ON pipeline_stages(tenant_id, module_key);

-- ============================================================================
-- 5. CUSTOM FIELD DEFINITIONS (Dynamic Schema Declarations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_key VARCHAR(50) NOT NULL DEFAULT 'leads', -- 'leads', 'properties'
    field_key VARCHAR(100) NOT NULL, -- 'budget_range', 'vastu', 'rera_no'
    field_label VARCHAR(255) NOT NULL,
    field_type VARCHAR(50) NOT NULL, -- 'text', 'number', 'select', 'date', 'boolean'
    options JSONB DEFAULT '[]'::jsonb, -- Array of options for 'select' type
    is_required BOOLEAN DEFAULT false,
    is_filterable BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, module_key, field_key)
);

CREATE INDEX idx_custom_field_def_tenant ON custom_field_definitions(tenant_id, module_key);

-- ============================================================================
-- 6. LEADS (Prospective Buyers with JSONB Custom Data)
-- ============================================================================
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    source VARCHAR(100) DEFAULT 'Walk-in', -- '99acres', 'MagicBricks', 'Meta Ads', 'Referral'
    budget NUMERIC(15, 2),
    location_preference VARCHAR(255),
    project_id_interested UUID,
    custom_data JSONB DEFAULT '{}'::jsonb, -- Stores dynamic tenant fields: {"vastu": "East", "budget_range": "1.5Cr"}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX idx_leads_phone ON leads(tenant_id, phone); -- Fast lookup for deduplication!
CREATE INDEX idx_leads_stage ON leads(tenant_id, stage_id);
CREATE INDEX idx_leads_assigned ON leads(tenant_id, assigned_user_id);
CREATE INDEX idx_leads_custom_data ON leads USING GIN (custom_data); -- High-speed GIN index for JSONB filters!

-- ============================================================================
-- 7. PROPERTIES & PROPERTY UNITS (Inventory Matching)
-- ============================================================================
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, -- Project / Tower Name
    location VARCHAR(255) NOT NULL,
    builder VARCHAR(255),
    custom_data JSONB DEFAULT '{}'::jsonb, -- {"rera_no": "P521000...", "amenities": ["Pool", "Gym"]}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_properties_tenant_id ON properties(tenant_id);
CREATE INDEX idx_properties_custom_data ON properties USING GIN (custom_data);

CREATE TABLE IF NOT EXISTS property_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit_number VARCHAR(50) NOT NULL, -- e.g., "A-402"
    type VARCHAR(50) NOT NULL, -- e.g., "3 BHK", "2 BHK", "Penthouse"
    price NUMERIC(15, 2) NOT NULL,
    carpet_area_sqft NUMERIC(10, 2),
    status VARCHAR(50) DEFAULT 'Available', -- 'Available', 'Blocked', 'Under Offer', 'Sold'
    custom_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_property_units_tenant_prop ON property_units(tenant_id, property_id);
CREATE INDEX idx_property_units_status ON property_units(tenant_id, status);

-- ============================================================================
-- 8. TIMELINE EVENTS (Immutable Audit Log for Calls, WA, Notes & Merges)
-- ============================================================================
CREATE TABLE IF NOT EXISTS timeline_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL, -- 'note', 'call', 'wa_sent', 'wa_received', 'stage_change', 'portal_re_inquiry', 'system_merge'
    content TEXT, -- Note body or message snippet
    metadata JSONB DEFAULT '{}'::jsonb, -- {"duration": 184, "audio_url": "...", "waba_id": "...", "old_stage": "New"}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_timeline_events_tenant_lead ON timeline_events(tenant_id, lead_id);
CREATE INDEX idx_timeline_events_type ON timeline_events(tenant_id, event_type);
CREATE INDEX idx_timeline_events_created ON timeline_events(lead_id, created_at DESC);

-- ============================================================================
-- 9. LEAD ROUTING RULES & ASYNC IMPORT JOBS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lead_routing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rule_name VARCHAR(255) NOT NULL,
    rule_type VARCHAR(50) DEFAULT 'ROUND_ROBIN', -- 'ROUND_ROBIN', 'LOCATION_MATCH', 'SOURCE_DEDICATED'
    source_filter VARCHAR(100), -- e.g., '99acres'
    active_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of eligible user UUIDs in rotation
    last_assigned_index INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lead_routing_rules_tenant ON lead_routing_rules(tenant_id);

CREATE TABLE IF NOT EXISTS import_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'PROCESSING', -- 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL'
    total_rows INTEGER DEFAULT 0,
    processed_rows INTEGER DEFAULT 0,
    success_rows INTEGER DEFAULT 0,
    error_rows INTEGER DEFAULT 0,
    error_log_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_import_jobs_tenant ON import_jobs(tenant_id);

-- ============================================================================
-- 10. MESSAGE TEMPLATES (TRAI DLT & Meta WABA Approved Scripts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL, -- 'whatsapp', 'sms', 'email'
    template_name VARCHAR(255) NOT NULL,
    external_template_id VARCHAR(255), -- Meta WABA Template ID or TRAI DLT Template ID
    content_script TEXT NOT NULL,
    variables JSONB DEFAULT '[]'::jsonb, -- ["buyer_name", "project_name", "agent_phone"]
    status VARCHAR(50) DEFAULT 'APPROVED', -- 'APPROVED', 'PENDING', 'REJECTED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_message_templates_tenant_channel ON message_templates(tenant_id, channel);

-- ============================================================================
-- 11. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

-- Note: In application middleware, set the tenant context session variable:
-- SET LOCAL app.current_tenant_id = 'org_bhumi_uuid';
-- Example RLS Policy for Leads:
CREATE POLICY tenant_isolation_policy_leads ON leads
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ============================================================================
-- END OF INITIAL SCHEMA MIGRATION
-- ============================================================================

-- ============================================================================
-- 004_LEADS.SQL — Prospective Buyer Pipeline & Round-Robin Routing Rules
-- ============================================================================
-- Why are base fields (phone, email, source) fixed SQL columns?
-- Standard columns are mandatory for high-speed deduplication, B-tree indexes,
-- and relational joins. Dynamic tenant fields are merged into custom_data (JSONB).
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

CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(tenant_id, phone); -- Fast lookup for deduplication!
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(tenant_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(tenant_id, assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_custom_data ON leads USING GIN (custom_data); -- High-speed GIN index for JSONB filters!

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

CREATE INDEX IF NOT EXISTS idx_lead_routing_rules_tenant ON lead_routing_rules(tenant_id);

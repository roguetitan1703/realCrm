-- ============================================================================
-- 004_ROUTING_RULES.SQL — Automated Round-Robin & Duty Roster Routing
-- ============================================================================
-- Works across any module! Can automatically assign Leads, Inquiries, or
-- Client support tickets equitably among active duty agents.
-- ============================================================================

CREATE TABLE IF NOT EXISTS routing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_key VARCHAR(50) NOT NULL DEFAULT 'leads', -- Applies to any module!
    rule_name VARCHAR(255) NOT NULL,
    rule_type VARCHAR(50) DEFAULT 'ROUND_ROBIN', -- 'ROUND_ROBIN', 'LOCATION_MATCH', 'SOURCE_DEDICATED'
    source_filter VARCHAR(100), -- e.g., '99acres', 'MagicBricks'
    active_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of eligible user UUIDs in rotation
    last_assigned_index INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_routing_rules_tenant_module ON routing_rules(tenant_id, module_key);

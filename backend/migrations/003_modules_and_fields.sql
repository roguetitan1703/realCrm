-- ============================================================================
-- 003_MODULES_AND_FIELDS.SQL — Pure Composable Universal Module Engine
-- ============================================================================
-- Why this is architectural perfection:
-- NO hardcoded SQL tables for leads, properties, clients, or deals!
-- Every entity in the CRM is dynamically declared in `modules` and all data
-- lives in the universal `module_records` table with GIN indexed JSONB!
-- To maintain SQL B-Tree speed for Exotel calling, WhatsApp matching, and
-- instant deduplication, `primary_phone` and `primary_email` are indexed columns.
-- ============================================================================

CREATE TABLE IF NOT EXISTS modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key VARCHAR(50) NOT NULL, -- e.g., 'leads', 'properties', 'clients', 'deals', 'units'
    name VARCHAR(100) NOT NULL, -- e.g., 'Leads', 'Properties', 'Clients'
    icon VARCHAR(50) DEFAULT 'Folder',
    is_system BOOLEAN DEFAULT false, -- true for core defaults, false for custom created ones
    config JSONB DEFAULT '{"supports_pipeline": true, "supports_custom_fields": true, "default_view": "kanban", "title_field": "name"}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_modules_tenant ON modules(tenant_id);

CREATE TABLE IF NOT EXISTS pipeline_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_key VARCHAR(50) NOT NULL, -- Points to modules.key ('leads', 'deals', 'clients')
    name VARCHAR(100) NOT NULL,
    key VARCHAR(50) NOT NULL,
    color VARCHAR(20) DEFAULT '#2563EB',
    order_index INTEGER NOT NULL DEFAULT 1,
    is_default BOOLEAN DEFAULT false,
    is_closed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_tenant_module ON pipeline_stages(tenant_id, module_key);

CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_key VARCHAR(50) NOT NULL, -- Points to modules.key
    field_key VARCHAR(100) NOT NULL, -- e.g., 'budget', 'vastu', 'rera_no', 'company_name'
    field_label VARCHAR(255) NOT NULL,
    field_type VARCHAR(50) NOT NULL, -- 'text', 'number', 'select', 'date', 'phone', 'email', 'boolean'
    options JSONB DEFAULT '[]'::jsonb, -- Array of options for 'select' type
    is_required BOOLEAN DEFAULT false,
    is_filterable BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, module_key, field_key)
);

CREATE INDEX IF NOT EXISTS idx_custom_field_def_tenant ON custom_field_definitions(tenant_id, module_key);

-- ============================================================================
-- THE UNIVERSAL RECORD STORE (`module_records`)
-- All CRM entities (Leads, Properties, Clients, Deals, Units) live here!
-- ============================================================================
CREATE TABLE IF NOT EXISTS module_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_key VARCHAR(50) NOT NULL, -- Distinguishes 'leads' vs 'properties' vs 'clients'
    parent_record_id UUID REFERENCES module_records(id) ON DELETE CASCADE, -- Enables hierarchies (e.g., Unit -> Property, Deal -> Client)
    title VARCHAR(255) NOT NULL, -- Display title (e.g., "Aarav Sharma" or "Godrej Woods Tower B")
    primary_phone VARCHAR(50), -- B-Tree indexed for instant Exotel calling & WhatsApp dedup matching!
    primary_email VARCHAR(255), -- B-Tree indexed for instant email deduplication!
    stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb, -- Holds ALL dynamic fields: {"budget": 15000000, "vastu": "East", "source": "99acres"}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_module_records_tenant_module ON module_records(tenant_id, module_key);
CREATE INDEX IF NOT EXISTS idx_module_records_phone ON module_records(tenant_id, module_key, primary_phone);
CREATE INDEX IF NOT EXISTS idx_module_records_email ON module_records(tenant_id, module_key, primary_email);
CREATE INDEX IF NOT EXISTS idx_module_records_stage ON module_records(tenant_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_module_records_assigned ON module_records(tenant_id, assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_module_records_parent ON module_records(parent_record_id);
CREATE INDEX IF NOT EXISTS idx_module_records_data ON module_records USING GIN (data); -- High-speed GIN index for custom JSONB filters!

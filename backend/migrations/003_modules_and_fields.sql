-- ============================================================================
-- 003_MODULES_AND_FIELDS.SQL — Composable CRM Module Registry & Custom Fields
-- ============================================================================
-- Defines the core metadata engine allowing tenants to declare custom modules
-- (e.g., Loan Applications, Legal Docs), custom pipeline stages, and dynamic
-- custom field definitions without altering SQL tables.
-- ============================================================================

CREATE TABLE IF NOT EXISTS modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key VARCHAR(50) NOT NULL, -- e.g., 'leads', 'properties', 'loan_applications', 'legal_docs'
    name VARCHAR(100) NOT NULL, -- e.g., 'Loan Applications'
    icon VARCHAR(50) DEFAULT 'Folder',
    is_system BOOLEAN DEFAULT false, -- true for built-in 'leads', false for tenant custom modules
    config JSONB DEFAULT '{"supports_pipeline": true, "supports_custom_fields": true, "default_view": "kanban"}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_modules_tenant ON modules(tenant_id);

CREATE TABLE IF NOT EXISTS pipeline_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_key VARCHAR(50) NOT NULL DEFAULT 'leads', -- Points to modules.key
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
    module_key VARCHAR(50) NOT NULL DEFAULT 'leads', -- Points to modules.key
    field_key VARCHAR(100) NOT NULL, -- 'budget_range', 'vastu', 'bank_name'
    field_label VARCHAR(255) NOT NULL,
    field_type VARCHAR(50) NOT NULL, -- 'text', 'number', 'select', 'date', 'boolean'
    options JSONB DEFAULT '[]'::jsonb, -- Array of options for 'select' type
    is_required BOOLEAN DEFAULT false,
    is_filterable BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, module_key, field_key)
);

CREATE INDEX IF NOT EXISTS idx_custom_field_def_tenant ON custom_field_definitions(tenant_id, module_key);

-- Generic storage table for custom tenant modules (e.g., 'Loan Applications')
CREATE TABLE IF NOT EXISTS module_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_key VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL, -- e.g., "HDFC Loan #1092 - Aarav Sharma"
    stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    custom_data JSONB DEFAULT '{}'::jsonb, -- Dynamic custom fields stored in GIN indexed JSONB
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_module_records_tenant_module ON module_records(tenant_id, module_key);
CREATE INDEX IF NOT EXISTS idx_module_records_custom_data ON module_records USING GIN (custom_data);

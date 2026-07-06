-- ============================================================================
-- 008_RLS_POLICIES.SQL — Row-Level Security Enforcement Across All Tables
-- ============================================================================
-- Ensures strict multi-tenant data isolation at the PostgreSQL engine layer.
-- In application middleware, set the session context variable:
-- SET LOCAL app.current_tenant_id = 'org_bhumi_uuid';
-- ============================================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

-- Policy helper: Isolation by matching tenant_id with app.current_tenant_id
CREATE POLICY rls_policy_leads ON leads
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE POLICY rls_policy_properties ON properties
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE POLICY rls_policy_module_records ON module_records
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE POLICY rls_policy_timeline ON timeline_events
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

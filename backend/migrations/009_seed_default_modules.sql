-- ============================================================================
-- 009_SEED_DEFAULT_MODULES.SQL — Seeding Built-in CRM Modules & Pipeline Stages
-- ============================================================================
-- Seeds the default 'leads' and 'properties' modules along with standard Indian
-- real estate pipeline stages and custom field definitions for demo workspace.
-- ============================================================================

-- 1. Insert default Bhumi Propcity Demo Tenant
INSERT INTO tenants (id, name, slug, brand_config, enabled_modules, subscription_plan, subscription_status)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Bhumi Propcity (Demo Workspace)',
    'bhumi-propcity',
    '{"primaryColor": "#1E6F52", "surfaceColor": "#F6F5F2", "city": "Pune", "logoUrl": ""}'::jsonb,
    '["leads", "properties", "team", "dialer", "import", "whatsapp"]'::jsonb,
    'ENTERPRISE',
    'ACTIVE'
) ON CONFLICT (slug) DO NOTHING;

-- 2. Insert Core System Modules ('leads' and 'properties')
INSERT INTO modules (tenant_id, key, name, icon, is_system, config)
VALUES 
(
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'leads',
    'Leads',
    'Users',
    true,
    '{"supports_pipeline": true, "supports_custom_fields": true, "default_view": "kanban", "title_field": "name", "primary_contact_field": "primary_phone"}'::jsonb
),
(
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'properties',
    'Properties & Projects',
    'Building',
    true,
    '{"supports_pipeline": false, "supports_custom_fields": true, "default_view": "grid", "title_field": "project_name"}'::jsonb
) ON CONFLICT (tenant_id, key) DO NOTHING;

-- 3. Seed Indian Real Estate Pipeline Stages for Leads
INSERT INTO pipeline_stages (id, tenant_id, module_key, name, key, color, order_index, is_default, is_closed)
VALUES 
('11111111-1111-1111-1111-111111111101', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'leads', 'New Inquiry', 'new', '#3B82F6', 1, true, false),
('11111111-1111-1111-1111-111111111102', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'leads', 'Contacted', 'contacted', '#8B5CF6', 2, false, false),
('11111111-1111-1111-1111-111111111103', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'leads', 'Site Visit Scheduled', 'visit_scheduled', '#F59E0B', 3, false, false),
('11111111-1111-1111-1111-111111111104', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'leads', 'Site Visit Done', 'visit_done', '#10B981', 4, false, false),
('11111111-1111-1111-1111-111111111105', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'leads', 'Negotiation', 'negotiation', '#EC4899', 5, false, false),
('11111111-1111-1111-1111-111111111106', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'leads', 'Closed Won', 'won', '#059669', 6, false, true),
('11111111-1111-1111-1111-111111111107', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'leads', 'Closed Lost', 'lost', '#6B7280', 7, false, true)
ON CONFLICT DO NOTHING;

-- 4. Seed Standard Custom Fields for Leads & Properties
INSERT INTO custom_field_definitions (tenant_id, module_key, field_key, field_label, field_type, options, is_required, is_filterable)
VALUES 
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'leads', 'budget_range', 'Budget Range', 'select', '["Under 50 Lakhs", "50 Lakhs - 1 Cr", "1 Cr - 1.5 Cr", "1.5 Cr - 2.5 Cr", "2.5 Cr+"]'::jsonb, false, true),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'leads', 'vastu_preference', 'Vastu Preference', 'select', '["East Facing", "North Facing", "North-East", "Any"]'::jsonb, false, true),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'leads', 'property_type', 'Property Type Interested', 'select', '["2 BHK", "3 BHK", "4 BHK / Penthouse", "Commercial Office", "Plot / Land"]'::jsonb, true, true),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'properties', 'rera_no', 'RERA Registration No.', 'text', '[]'::jsonb, true, true),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'properties', 'possession_status', 'Possession Status', 'select', '["Ready to Move", "Under Construction (2026)", "Under Construction (2027+)", "New Launch"]'::jsonb, true, true)
ON CONFLICT (tenant_id, module_key, field_key) DO NOTHING;

-- 5. Seed Demo User Account
INSERT INTO users (id, tenant_id, name, email, phone_number, role, branch_location, status, password_hash)
VALUES (
    'usr_demo_admin_001',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Priya Patel',
    'priya@bhumipropcity.com',
    '+919820011223',
    'TENANT_ADMIN',
    'Pune West Office',
    'ACTIVE',
    '$2b$10$DemoHashNotRealPassword'
) ON CONFLICT (email) DO NOTHING;

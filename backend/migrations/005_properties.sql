-- ============================================================================
-- 005_PROPERTIES.SQL — Projects, Towers & Inventory Unit Management
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

CREATE INDEX IF NOT EXISTS idx_properties_tenant_id ON properties(tenant_id);
CREATE INDEX IF NOT EXISTS idx_properties_custom_data ON properties USING GIN (custom_data);

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

CREATE INDEX IF NOT EXISTS idx_property_units_tenant_prop ON property_units(tenant_id, property_id);
CREATE INDEX IF NOT EXISTS idx_property_units_status ON property_units(tenant_id, status);

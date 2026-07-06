-- ============================================================================
-- 002_USERS.SQL — Team Hierarchy, Branch Locations & Role Permissions
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

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_reports_to ON users(reports_to_user_id);

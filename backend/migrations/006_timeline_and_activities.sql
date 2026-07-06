-- ============================================================================
-- 006_TIMELINE_AND_ACTIVITIES.SQL — Audit Logs & Message Templates
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

CREATE INDEX IF NOT EXISTS idx_timeline_events_tenant_lead ON timeline_events(tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_type ON timeline_events(tenant_id, event_type);
CREATE INDEX IF NOT EXISTS idx_timeline_events_created ON timeline_events(lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL, -- 'whatsapp', 'sms', 'email'
    template_name VARCHAR(255) NOT NULL,
    external_template_id VARCHAR(255), -- Meta WABA Template ID or Indian TRAI DLT SMS Template ID
    content_script TEXT NOT NULL,
    variables JSONB DEFAULT '[]'::jsonb, -- ["buyer_name", "project_name", "agent_phone"]
    status VARCHAR(50) DEFAULT 'APPROVED', -- 'APPROVED', 'PENDING', 'REJECTED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_message_templates_tenant_channel ON message_templates(tenant_id, channel);

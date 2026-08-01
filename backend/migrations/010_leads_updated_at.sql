-- ============================================================================
-- 010_LEADS_UPDATED_AT.SQL — a change stamp the desk can poll cheaply
-- ============================================================================
-- crm_properties already carries updated_at; crm_leads only had created_at, so
-- an edit or a reassignment left no trace a "has anything changed?" check could
-- see. Without this, an open tab keeps showing a lead as unassigned after
-- someone else has taken it, until the page is reloaded by hand.
--
-- Backfilled to created_at rather than NOW() so existing rows don't all read as
-- "just changed" the moment this lands.

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;
UPDATE crm_leads SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE crm_leads ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

-- The pulse endpoint reads max(updated_at) per tenant on every poll.
CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_updated ON crm_leads (tenant_id, updated_at DESC);

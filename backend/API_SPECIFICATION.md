# ⚡ Bhumi Propcity CRM — Domain-Specific API & Action Specification

While our database underlying engine uses a high-performance **Composable Module Architecture** (`module_records` with B-Tree indexed helper columns + GIN JSONB), our **REST API endpoints are custom, typed, and deeply tailored to Indian Real Estate workflows**.

Every module has its own **Core Locked Fields** (mandatory SQL columns required for indexing, deduplication, and telephony speed), **Dynamic Fields** (stored in JSONB), **Domain-Specific Action APIs**, and **Strict Safety Checks**.

---

## 🏛️ Comprehensive Module API & Action Matrix

### 1. 👥 Module: `leads` (Prospective Buyer Pipeline)
* **Core Locked Fields (SQL Columns):** 
  * `title` (Buyer Name — mandatory string)
  * `primary_phone` (10-digit Indian mobile — **B-Tree Indexed** for instant deduplication & Exotel dialing)
  * `primary_email` (**B-Tree Indexed** for email dedup)
  * `stage_id` (FK to `pipeline_stages`)
  * `assigned_user_id` (FK to `users`)
* **Dynamic Custom Fields (JSONB `data`):** `budget_range`, `vastu_preference`, `property_type` (2/3/4 BHK), `location_preference`, `source` (99acres, Walk-in, Meta Ads).
* **Domain-Specific APIs & Actions:**
  * `POST /api/v1/modules/leads/records/:id/actions/call` $\rightarrow$ Triggers 2-leg Exotel telephony bridge.
    * *Safety Check:* Verifies agent has active call minutes quota and `primary_phone` is valid E.164.
  * `POST /api/v1/modules/leads/records/:id/actions/whatsapp` $\rightarrow$ Sends Meta WABA template.
    * *Safety Check:* Verifies template is Meta-approved (`status == 'APPROVED'`) and substitutes variables (`{{buyer_name}}`, `{{project_name}}`).
  * `POST /api/v1/modules/leads/records/:id/actions/schedule-visit` $\rightarrow$ Schedules a physical Site Visit.
    * *Safety Check:* Automatically updates stage to *"Site Visit Scheduled"*, logs calendar invite in timeline, and triggers confirmation WhatsApp to buyer.
  * `POST /api/v1/modules/leads/records/:id/actions/assign-round-robin` $\rightarrow$ Triggers automated rotation assignment.
    * *Safety Check:* Checks `routing_rules` and skips any sales agent whose status is `OFF_DUTY` or `ON_LEAVE`.
  * `POST /api/v1/modules/leads/records/:id/actions/convert-to-client` $\rightarrow$ Converts a *"Closed Won"* lead into a permanent Client / Booking record.

---

### 2. 🏢 Module: `properties` (Projects & Inventory Towers)
* **Core Locked Fields (SQL Columns):**
  * `title` (Project / Tower Name — e.g., "Godrej Woods - Tower B")
  * `stage_id` (Construction / Sales Status — e.g., "Ready to Move", "New Launch")
  * `assigned_user_id` (Project Manager / Sales Head)
* **Dynamic Custom Fields (JSONB `data`):** `rera_no` (mandatory), `builder_name`, `possession_year`, `city`, `locality`, `amenities_list`, `brochure_pdf_url`.
* **Domain-Specific APIs & Actions:**
  * `GET /api/v1/modules/properties/records/:id/units` $\rightarrow$ Fetches all inventory units linked to this project (`parent_record_id = :id`), grouped by floor and BHK type.
  * `POST /api/v1/modules/properties/records/:id/actions/block-unit` $\rightarrow$ Temporarily blocks an inventory unit (e.g., Unit A-402) during token negotiation.
    * *Safety Check (Double-Booking Prevention):* Enforces database row-level locking (`SELECT FOR UPDATE`). If unit status is not `"Available"`, aborts with HTTP 409 Conflict!
  * `POST /api/v1/modules/properties/records/:id/actions/release-unit` $\rightarrow$ Releases a blocked unit back to `"Available"` if token payment expires after 48 hours.
  * `POST /api/v1/modules/properties/records/:id/actions/generate-brochure-link` $\rightarrow$ Generates a tracked, expiring PDF brochure link for WhatsApp distribution.

---

### 3. 🛡️ Module: `team` (Sales Agents, Branch Offices & Duty Rosters)
* **Core Locked Fields (in `users` table):** `name`, `email`, `phone_number` (Leg 1 Exotel target!), `role` (`TENANT_ADMIN`, `SALES_MANAGER`, `SALES_AGENT`), `branch_location`, `status` (`ACTIVE`, `OFF_DUTY`, `ON_LEAVE`).
* **Domain-Specific APIs & Actions:**
  * `PATCH /api/v1/team/users/:id/duty-status` $\rightarrow$ Toggles agent duty status (`ACTIVE` vs `OFF_DUTY`).
    * *Safety Check:* When toggled to `OFF_DUTY`, middleware automatically removes the agent UUID from all active `routing_rules.active_user_ids` arrays so leads aren't assigned to sleeping agents!
  * `GET /api/v1/team/users/:id/performance` $\rightarrow$ Aggregates sales velocity metrics: total outbound calls, total talk duration, site visit conversion rate, and revenue closed.
  * `POST /api/v1/team/users/:id/reassign-leads` $\rightarrow$ Bulk reassigns all open leads from an inactive/departing agent to an active team member.

---

### 4. 🔌 Module: `integrations` & `ingest` (Exotel, Meta WABA & Portal Webhooks)
* **Domain-Specific APIs & Actions:**
  * `POST /api/v1/ingest/:tenantSlug/99acres` $\rightarrow$ Idempotent 99acres XML/JSON lead parser.
    * *Safety Check (Instant Dedup):* Queries `idx_module_records_phone` in `< 1ms`. If phone exists, does NOT create duplicate row; appends `"Re-inquired on 99acres for Godrej Woods"` to existing lead's timeline and alerts assigned agent!
  * `POST /api/v1/ingest/:tenantSlug/exotel-webhook` $\rightarrow$ Receives Exotel call completion payload.
    * *Action:* Automatically logs call duration, audio recording S3/Exotel URL, and call status (`completed`, `busy`, `no-answer`) into `timeline_events`.
  * `POST /api/v1/ingest/:tenantSlug/meta-waba` $\rightarrow$ Ingests incoming WhatsApp buyer replies and read receipts.
  * `POST /api/v1/integrations/verify-credentials` $\rightarrow$ Tests Exotel API Key/Secret or Meta WABA Token against live provider servers before saving to encrypted `tenant_integrations`.

---

### 5. 📥 Module: `import_jobs` (Bulk Spreadsheet Uploads)
* **Domain-Specific APIs & Actions:**
  * `POST /api/v1/import/upload` $\rightarrow$ Accepts multipart Excel (`.xlsx`) or CSV files up to 10,000 rows. Returns `job_id` and parsed headers.
  * `POST /api/v1/import/:jobId/map-columns` $\rightarrow$ Maps Excel columns (e.g., `"Mobile No"` $\rightarrow$ `primary_phone`, `"Budget"` $\rightarrow$ `budget_range`). Triggers async background worker.
    * *Safety Check:* Runs row-by-row Zod validation. Valid rows are batch inserted; failed rows are logged into an error report without aborting the entire upload!
  * `GET /api/v1/import/:jobId/status` $\rightarrow$ Polling endpoint returning `processed_rows`, `success_rows`, `error_rows`, and `error_log_url`.

---

### 6. ⚙️ Module: `settings` (Branding, Templates & Workspace Management)
* **Domain-Specific APIs & Actions:**
  * `PATCH /api/v1/settings/branding` $\rightarrow$ Updates workspace primary color (`#1E6F52`), logo, and surface accents.
  * `GET /api/v1/settings/templates` & `POST /api/v1/settings/templates` $\rightarrow$ CRUD for WhatsApp & SMS templates.
    * *Safety Check:* Validates template variable syntax (`{{variable_name}}`) against Indian TRAI DLT guidelines and Meta WABA rules.
  * `POST /api/v1/settings/reset-demo-data` $\rightarrow$ Clears demo leads and reseeds clean sample data.
    * *Safety Check:* Requires `TENANT_ADMIN` role and explicit password re-verification.

---

## 🔒 Summary of Core Safety Checks Enforced Across All APIs

1. **Row-Level Security (RLS) Isolation:** Every single SQL query enforces `tenant_id = app.current_tenant_id` at the database engine level.
2. **Idempotent Webhook Deduplication:** Primary phone and email are B-tree indexed columns on `module_records`, ensuring 0ms duplicate detection.
3. **Double-Booking Row Locking:** Inventory unit reservation uses PostgreSQL transactional locking (`SELECT FOR UPDATE`) to prevent simultaneous sales agent bookings.
4. **Runtime Zod Validation:** Custom field insertions are validated against dynamic schema rules before DB execution.

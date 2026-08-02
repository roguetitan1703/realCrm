/**
 * ============================================================================
 * 🗄️ SUPABASE POSTGRESQL CONNECTION & SCHEMA ENGINE
 * ============================================================================
 * Connects directly to Supabase PostgreSQL using lightweight `postgres` engine.
 * Manages schema creation (DDL) and connection pooling.
 * ============================================================================
 */
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

// 1. Zero-dependency .env loader
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let val = match[2] || '';
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        // Real environment variables win — a .env file is only a fallback. This
        // matches standard dotenv behaviour and stops a stale .env on the server
        // from clobbering what the platform (AWS) actually injected.
        if (process.env[match[1]] === undefined) process.env[match[1]] = val;
      }
    }
  }
} catch (e) {
  console.warn('[DB Engine] Could not load local .env file:', e);
}

// DATABASE_URL is required. It must come from the environment (AWS) or a local
// .env — never a hardcoded default. A committed connection string is a leaked
// production credential, so a missing one fails loudly instead of silently
// connecting somewhere it shouldn't.
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('[DB Engine] DATABASE_URL is not set. Provide it via the environment or a local .env file.');
}

export const sql = postgres(dbUrl, {
  ssl: 'require',
  max: 10,
  idle_timeout: 20,
  connect_timeout: 15,
});

// Canonical id of the seeded DEMO tenant. Deliberately a neutral firm — not any
// real client's name — so demo/fake data never rides under a real brand. Real
// tenants (incl. actual clients) are created through onboarding. It doubles as
// the slug the frontend sends in X-Tenant-ID, so tenant_id === slug throughout.
export const DEFAULT_TENANT_ID = 'skyline-realty';
export const DEFAULT_TENANT_NAME = 'Skyline Realty';
// Legacy demo-tenant ids to retire (their data is re-homed onto the new tenant).
export const LEGACY_TENANT_IDS = ['bhumi-propcity', 'org_bhumi_109'];

/**
 * Initialize idempotent Supabase PostgreSQL database tables.
 */
export async function initSchema(): Promise<void> {
  console.log('[Supabase DB] ⚙️ Verifying PostgreSQL schema and DDL tables...');
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        brand_config JSONB DEFAULT '{"primaryColor": "#1E6F52", "surfaceColor": "#F6F5F2", "city": "Pune"}'::jsonb,
        enabled_modules JSONB DEFAULT '["leads", "properties", "team", "dialer", "import", "whatsapp"]'::jsonb,
        subscription_plan VARCHAR(50) DEFAULT 'PRO',
        subscription_status VARCHAR(50) DEFAULT 'ACTIVE',
        usage_limits JSONB DEFAULT '{"max_agents": 25, "whatsapp_credits_limit": 10000, "whatsapp_credits_used": 0, "call_minutes_limit": 5000, "call_minutes_used": 0}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS crm_agents (
        id TEXT PRIMARY KEY,
        name TEXT,
        first TEXT,
        initials TEXT,
        avatar TEXT,
        role TEXT DEFAULT 'agent',
        duty_status TEXT DEFAULT 'ACTIVE',
        metadata JSONB DEFAULT '{}'::jsonb
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS crm_properties (
        id TEXT PRIMARY KEY,
        title TEXT,
        status TEXT DEFAULT 'Available',
        type TEXT,
        locality TEXT,
        price TEXT,
        tower TEXT,
        unit TEXT,
        config JSONB DEFAULT '{}'::jsonb,
        tenancy JSONB,
        timeline JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS crm_units (
        id TEXT PRIMARY KEY,
        property_id TEXT NOT NULL,
        title TEXT,
        data JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS crm_leads (
        id TEXT PRIMARY KEY,
        name TEXT,
        phone TEXT,
        email TEXT,
        stage TEXT DEFAULT 'New',
        source TEXT DEFAULT 'Website',
        agent_id TEXT,
        req JSONB DEFAULT '{}'::jsonb,
        notes JSONB DEFAULT '[]'::jsonb,
        shortlist JSONB DEFAULT '[]'::jsonb,
        feedback JSONB DEFAULT '{}'::jsonb,
        duplicate_of TEXT,
        follow_up JSONB,
        overdue BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    // Idempotent upgrade for databases created before follow_up/overdue existed.
    // Without these, every lead silently loses its follow-up and nothing is ever
    // overdue — which empties the agent's Today screen and the Overdue KPI.
    await sql`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS follow_up JSONB;`;
    await sql`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS overdue BOOLEAN DEFAULT FALSE;`;
    await sql`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS import_batch_id TEXT;`;

    // WHO CREATED THIS LEAD. A sales executive may fully edit a lead they
    // created and only the status/remarks on one merely assigned to them, so
    // ownership and assignment are two different questions and need two columns.
    //
    // Deliberately NOT backfilled from agent_id. Existing rows were created by
    // the desk, by an import or by an inbound webhook — nobody knows by whom, and
    // NULL says exactly that. Copying agent_id in would silently hand every agent
    // full edit rights over every lead currently on their plate, which is the
    // opposite of what this column is for. NULL grants nothing.
    await sql`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS created_by TEXT;`;

    // The rejection reason, as a column rather than only as prose in a remark —
    // "why do we lose deals" is a question the firm asks of the whole table.
    await sql`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS rejection_reason TEXT;`;

    await sql`
      CREATE TABLE IF NOT EXISTS crm_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL
      );
    `;

    // crm_integrations (a tenant-scoped KV of provider credentials) is gone.
    // `integrations` below is the real one: a row per connection, its own key.
    
    await sql`
      CREATE TABLE IF NOT EXISTS crm_routing_rules (
        id INT PRIMARY KEY DEFAULT 1,
        strategy TEXT DEFAULT 'round_robin',
        active_agent_ids JSONB DEFAULT '[]'::jsonb,
        last_assigned_index INT DEFAULT -1
      );
    `;
    // Two sweeps, off by default, distinct from arrival-time routing above:
    // B — pick up a lead nobody owns (never assigned, or its owner left);
    // C — take a lead back from an assignee who has gone quiet on it.
    await sql`ALTER TABLE crm_routing_rules ADD COLUMN IF NOT EXISTS sweep_unassigned_enabled BOOLEAN DEFAULT false;`;
    await sql`ALTER TABLE crm_routing_rules ADD COLUMN IF NOT EXISTS sweep_unassigned_hours INT DEFAULT 4;`;
    await sql`ALTER TABLE crm_routing_rules ADD COLUMN IF NOT EXISTS reassign_idle_enabled BOOLEAN DEFAULT false;`;
    await sql`ALTER TABLE crm_routing_rules ADD COLUMN IF NOT EXISTS reassign_idle_hours INT DEFAULT 2;`;
    // Same shape again, for the owner cold-calling list (crm_owners further
    // below) — its own rotation pool and its own pair of sweeps, entirely
    // separate from lead routing above: a firm may want every agent calling
    // leads but only two people cold-calling owners, or the reverse.
    await sql`ALTER TABLE crm_routing_rules ADD COLUMN IF NOT EXISTS owner_strategy TEXT DEFAULT 'manual';`;
    await sql`ALTER TABLE crm_routing_rules ADD COLUMN IF NOT EXISTS owner_active_agent_ids JSONB DEFAULT '[]'::jsonb;`;
    await sql`ALTER TABLE crm_routing_rules ADD COLUMN IF NOT EXISTS owner_last_assigned_index INT DEFAULT -1;`;
    await sql`ALTER TABLE crm_routing_rules ADD COLUMN IF NOT EXISTS owner_sweep_unassigned_enabled BOOLEAN DEFAULT false;`;
    await sql`ALTER TABLE crm_routing_rules ADD COLUMN IF NOT EXISTS owner_sweep_unassigned_hours INT DEFAULT 4;`;
    await sql`ALTER TABLE crm_routing_rules ADD COLUMN IF NOT EXISTS owner_reassign_idle_enabled BOOLEAN DEFAULT false;`;
    await sql`ALTER TABLE crm_routing_rules ADD COLUMN IF NOT EXISTS owner_reassign_idle_hours INT DEFAULT 2;`;

    // Owner cold-calling list — property owners a firm calls to ask if they
    // want to sell/rent, deliberately NOT linked to a crm_properties row (the
    // desk doesn't necessarily list what they own) and NOT a crm_leads row
    // (a lead is buyer/tenant demand; this is supply-side outreach with its
    // own small status set). `project` is a free-text grouping key, same
    // spirit as crm_properties.project — a lens, not a foreign key.
    await sql`
      CREATE TABLE IF NOT EXISTS crm_owners (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT,
        phone TEXT,
        email TEXT,
        project TEXT,
        unit_ref TEXT,
        locality TEXT,
        stage TEXT DEFAULT 'New',
        source TEXT DEFAULT 'Import',
        agent_id TEXT,
        created_by TEXT,
        import_batch_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_crm_owners_tenant ON crm_owners (tenant_id);`;
    // A cold-calling list without a callback time is a list that gets called
    // once. `Callback` was already one of the six statuses with nowhere to
    // record WHEN — so the status meant "someone said call me back" and then
    // nothing surfaced it again. A real timestamp, not the lead's
    // {date,time,action} JSONB: a callback is one moment, it sorts, and
    // "overdue" is `callback_at < now()` rather than a parsed display string.
    await sql`ALTER TABLE crm_owners ADD COLUMN IF NOT EXISTS callback_at TIMESTAMPTZ;`;
    await sql`ALTER TABLE crm_owners ADD COLUMN IF NOT EXISTS callback_note TEXT;`;
    // Last outbound attempt, so "never called" is answerable without walking
    // the timeline for every row on a 700-row queue.
    await sql`ALTER TABLE crm_owners ADD COLUMN IF NOT EXISTS last_call_at TIMESTAMPTZ;`;
    await sql`CREATE INDEX IF NOT EXISTS idx_crm_owners_callback ON crm_owners (tenant_id, callback_at) WHERE callback_at IS NOT NULL;`;
    await sql`CREATE INDEX IF NOT EXISTS idx_crm_owners_agent ON crm_owners (tenant_id, agent_id);`;

    await sql`
      CREATE TABLE IF NOT EXISTS crm_timeline_events (
        id TEXT PRIMARY KEY,
        record_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        author TEXT,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'::jsonb
      );
    `;

    // ------------------------------------------------------------------------
    // Phase 0 — real auth + tenant identity (foundation for true multi-tenancy)
    // ------------------------------------------------------------------------

    // Platform operators (Delpat staff). NO tenant_id — they sit above tenants.
    // Email + password, distinct from the tenant phone-OTP flow.
    await sql`
      CREATE TABLE IF NOT EXISTS superadmins (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    // Tenant users (owner / manager / agent). Supersedes crm_agents as the
    // identity table; agents become users with role 'agent'. Login is by phone.
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT,
        phone TEXT,
        email TEXT,
        role TEXT NOT NULL DEFAULT 'agent',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (tenant_id);`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_phone ON users (tenant_id, phone);`;

    // Short-lived OTP challenges for phone login.
    await sql`
      CREATE TABLE IF NOT EXISTS auth_otp (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        phone TEXT NOT NULL,
        code TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    // Tag every tenant-owned table with tenant_id. Additive and idempotent:
    // existing single-workspace rows are backfilled to the Bhumi tenant below,
    // so nothing breaks while Phase 1 threads the filter through the queries.
    const TENANT_TABLES = [
      'crm_agents', 'crm_properties', 'crm_units', 'crm_leads',
      'crm_settings', 'crm_routing_rules', 'crm_timeline_events',
    ];
    for (const t of TENANT_TABLES) {
      await sql`ALTER TABLE ${sql(t)} ADD COLUMN IF NOT EXISTS tenant_id TEXT;`;
      await sql`UPDATE ${sql(t)} SET tenant_id = ${DEFAULT_TENANT_ID} WHERE tenant_id IS NULL;`;
      await sql`CREATE INDEX IF NOT EXISTS ${sql('idx_' + t + '_tenant')} ON ${sql(t)} (tenant_id);`;
    }

    // Widen the singleton config tables (settings / integrations / routing) from
    // ONE global row to one row PER TENANT. They were built single-workspace with
    // a scalar primary key (key, or id=1) that physically allowed only one row —
    // so two tenants couldn't each own their settings/routing. Drop that PK and
    // key on tenant_id instead. Idempotent: DROP CONSTRAINT IF EXISTS + CREATE
    // UNIQUE INDEX IF NOT EXISTS.
    await sql`ALTER TABLE crm_settings DROP CONSTRAINT IF EXISTS crm_settings_pkey;`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_settings_tenant_key ON crm_settings (tenant_id, key);`;
    await sql`ALTER TABLE crm_routing_rules DROP CONSTRAINT IF EXISTS crm_routing_rules_pkey;`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_routing_tenant ON crm_routing_rules (tenant_id);`;

    // Per-tenant PWA identity (installable app manifest + home-screen icons),
    // generated once at onboarding and stored here (icons as base64 PNG).
    await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pwa_config JSONB DEFAULT '{}'::jsonb;`;
    // Per-tenant lead-ingest key. Portals (99acres/MagicBricks/website) POST to
    // /api/v1/ingest/<slug>/<source>?key=<this>, so it's the shared secret we
    // hand the client to paste into their portal push-URL config.

    // Push subscriptions — one row per device a user has opted into push on.
    await sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions (tenant_id, user_id);`;

    await migrateProperColumns();
    await createLedgerTables();
    await migrateAuthV2();
    await migrateIngestionD1();

    console.log('[Supabase DB] ✅ PostgreSQL schema initialization completed successfully.');
  } catch (err: any) {
    console.error('[Supabase DB Error] Failed to initialize database schema:', err.message || err);
    throw err;
  }
}

/**
 * Auth v2 (spec: docs/specs/auth.md) — password login, sessions, resets.
 * Moves tenant users off OTP onto ID/email + password. Additive & idempotent, so
 * safe on every boot; the OTP path stays dormant until fully retired.
 */
export async function migrateAuthV2(): Promise<void> {
  // Seat/credential columns on the existing users table.
  const userCols: [string, string][] = [
    ['login_id', 'TEXT'],              // agent handle (email-login users leave null)
    ['password_hash', 'TEXT'],
    ['must_change_password', 'BOOLEAN DEFAULT FALSE'],
    ['email_verified', 'BOOLEAN DEFAULT FALSE'],
    ['deleted_at', 'TIMESTAMPTZ'],     // soft delete — row kept for attribution
    ['failed_logins', 'INT DEFAULT 0'],
    ['locked_until', 'TIMESTAMPTZ'],
  ];
  for (const [c, t] of userCols) {
    await sql.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${c} ${t}`);
  }
  // login_id unique per tenant (only where present — email-login users are null).
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_loginid ON users (tenant_id, login_id) WHERE login_id IS NOT NULL;`;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON users (tenant_id, lower(email));`;

  // Server-tracked sessions — the source of truth for validity/expiry, so a
  // session can be listed (active-sessions view) and revoked (force-logout). The
  // JWT carries this row's id as its `jti`.
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      ip TEXT,
      user_agent TEXT,
      revoked BOOLEAN DEFAULT FALSE
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (tenant_id, user_id);`;

  // Password-reset tokens (owner/manager self-serve). Token emailed as a link;
  // only its hash is stored; single-use; short TTL.
  await sql`
    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_pwreset_token ON password_resets (token_hash);`;

  // Unknown-key ingest attempts — minimal, short-lived abuse log (block D uses it
  // too). Bodies are never stored here.
  await sql`
    CREATE TABLE IF NOT EXISTS ingest_rejects (
      id TEXT PRIMARY KEY,
      received_at TIMESTAMPTZ DEFAULT NOW(),
      ip TEXT,
      key_prefix TEXT,
      note TEXT
    );
  `;
}

/**
 * One designed migration (not a per-stage patch): give crm_properties and
 * crm_leads real, indexable columns for the signals we query, and flatten the
 * existing config/req JSONB blobs into them. Idempotent — flatten only fills
 * columns that are still NULL, so it's safe on every boot. The JSONB stays as
 * overflow until the persistence layer reads columns first (next slice).
 */
export async function migrateProperColumns(): Promise<void> {
  const propCols: [string, string][] = [
    ['project', 'TEXT'], ['wing', 'TEXT'], ['unit_no', 'TEXT'], ['deal', 'TEXT'],
    ['facing', 'TEXT'], ['furnishing', 'TEXT'], ['parking', 'TEXT'], ['possession', 'TEXT'],
    ['builder', 'TEXT'], ['rera_no', 'TEXT'], ['owner_name', 'TEXT'],
    ['owner_phone', 'TEXT'], ['owner_email', 'TEXT'], ['floor', 'TEXT'],
    ['carpet_sqft', 'INT'], ['total_floors', 'INT'], ['age_years', 'INT'],
    ['price_amount', 'BIGINT'], ['extra', "JSONB DEFAULT '{}'::jsonb"], ['updated_at', 'TIMESTAMPTZ DEFAULT NOW()'],
  ];
  for (const [c, t] of propCols) {
    await sql.unsafe(`ALTER TABLE crm_properties ADD COLUMN IF NOT EXISTS ${c} ${t}`);
  }
  // digits(x): strip everything but digits so casts never blow up on "1,450 sqft".
  await sql.unsafe(`
    UPDATE crm_properties SET
      project      = COALESCE(project, NULLIF(config->>'project',''), NULLIF(config->>'society','')),
      wing         = COALESCE(wing, NULLIF(config->>'wing',''), tower),
      unit_no      = COALESCE(unit_no, NULLIF(config->>'flat',''), unit),
      deal         = COALESCE(deal, NULLIF(config->>'deal',''), 'sale'),
      facing       = COALESCE(facing, NULLIF(config->>'facing','')),
      furnishing   = COALESCE(furnishing, NULLIF(config->>'furnishing','')),
      parking      = COALESCE(parking, NULLIF(config->>'parking','')),
      possession   = COALESCE(possession, NULLIF(config->>'possession','')),
      builder      = COALESCE(builder, NULLIF(config->>'builder','')),
      rera_no      = COALESCE(rera_no, NULLIF(config->>'rera','')),
      owner_name   = COALESCE(owner_name, NULLIF(config->>'owner','')),
      owner_phone  = COALESCE(owner_phone, NULLIF(config->>'ownerPhone','')),
      owner_email  = COALESCE(owner_email, NULLIF(config->>'ownerEmail','')),
      floor        = COALESCE(floor, NULLIF(config->>'floor','')),
      carpet_sqft  = COALESCE(carpet_sqft, NULLIF(regexp_replace(COALESCE(config->>'carpet', config->>'area', ''), '\\D', '', 'g'), '')::INT),
      total_floors = COALESCE(total_floors, NULLIF(regexp_replace(COALESCE(config->>'totalFloors', ''), '\\D', '', 'g'), '')::INT),
      age_years    = COALESCE(age_years, NULLIF(regexp_replace(COALESCE(config->>'age', ''), '\\D', '', 'g'), '')::INT),
      price_amount = COALESCE(price_amount, NULLIF(regexp_replace(COALESCE(price, ''), '\\D', '', 'g'), '')::BIGINT)
  `);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_crm_properties_project ON crm_properties (tenant_id, project)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_crm_properties_status ON crm_properties (tenant_id, status)`);

  // Optional coordinates. Nothing populates these yet, and nothing requires
  // them: the B4 distance-to-property readout is explicitly conditional on a
  // property having coords, so a listing without them simply shows no distance.
  await sql.unsafe(`ALTER TABLE crm_properties ADD COLUMN IF NOT EXISTS geo_lat DOUBLE PRECISION`);
  await sql.unsafe(`ALTER TABLE crm_properties ADD COLUMN IF NOT EXISTS geo_lng DOUBLE PRECISION`);

  const leadCols: [string, string][] = [
    ['deal', 'TEXT'], ['requirement', 'TEXT'], ['locality', 'TEXT'],
    ['purpose', 'TEXT'], ['timeline_pref', 'TEXT'],
    ['budget_min', 'BIGINT'], ['budget_max', 'BIGINT'],
  ];
  for (const [c, t] of leadCols) {
    await sql.unsafe(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS ${c} ${t}`);
  }
  await sql.unsafe(`
    UPDATE crm_leads SET
      deal          = COALESCE(deal, NULLIF(req->>'deal',''), 'sale'),
      requirement   = COALESCE(requirement, NULLIF(req->>'config','')),
      locality      = COALESCE(locality, NULLIF(req->>'locality','')),
      purpose       = COALESCE(purpose, NULLIF(req->>'purpose','')),
      timeline_pref = COALESCE(timeline_pref, NULLIF(req->>'timeline','')),
      budget_min    = COALESCE(budget_min, NULLIF(regexp_replace(COALESCE(req->>'minBudget', req->>'budgetMin', ''), '\\D', '', 'g'), '')::BIGINT),
      budget_max    = COALESCE(budget_max, NULLIF(regexp_replace(COALESCE(req->>'maxBudget', req->>'budgetMax', ''), '\\D', '', 'g'), '')::BIGINT)
  `);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_crm_leads_stage ON crm_leads (tenant_id, stage)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_crm_leads_agent ON crm_leads (tenant_id, agent_id)`);
  // An agent's scope is "assigned to me OR created by me", so both sides of that
  // OR need an index or every agent's list becomes a sequential scan.
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_crm_leads_creator ON crm_leads (tenant_id, created_by)`);

  await migratePropertySchemaC4();
}

/**
 * Block C — portal-grade property schema (docs/specs/properties.md C4).
 *
 * Extends crm_properties rather than paralleling it: `floor` is already TEXT so
 * it holds the Ground/Basement token as-is, and carpet_sqft / total_floors /
 * age_years / possession / rera_no / builder / price_amount already exist and
 * keep their meaning.
 *
 * The split that matters: legacy `type` held TWO dimensions in one string
 * ("4 BHK Villa"), which is why no filter option could ever match it. It
 * becomes `bhk` + `subtype`. `type` is left in place, unread, until the form
 * that writes it is replaced.
 *
 * Real columns for anything filtered or sorted on; JSONB only for genuine
 * lists (amenities, fixtures) where a column per value would be absurd.
 */
export async function migratePropertySchemaC4(): Promise<void> {
  const cols: [string, string][] = [
    // Top level
    ['category', 'TEXT'], ['subtype', 'TEXT'], ['bhk', 'TEXT'],
    ['transaction_type', 'TEXT'], ['ownership', 'TEXT'],
    // Configuration
    ['bathrooms', 'TEXT'], ['balconies', 'TEXT'],
    ['builtup_sqft', 'INTEGER'], ['super_builtup_sqft', 'INTEGER'],
    ['plot_area', 'NUMERIC'], ['area_unit', 'TEXT'],
    // Which area the quoted price/sq.ft is derived from — without this a
    // price/sq.ft figure is not comparable between two listings.
    ['price_area_basis', 'TEXT'],
    ['covered_parking', 'TEXT'], ['open_parking', 'TEXT'],
    ['servant_room', 'BOOLEAN'],
    // Furnishing — lists, so JSONB is the honest shape
    ['furnish_type', 'TEXT'], ['fixtures', "JSONB DEFAULT '[]'::jsonb"],
    ['counted_items', "JSONB DEFAULT '{}'::jsonb"],
    ['society_amenities', "JSONB DEFAULT '[]'::jsonb"],
    // Rent-only terms
    ['preferred_tenants', "JSONB DEFAULT '[]'::jsonb"], ['pet_friendly', 'BOOLEAN'],
    ['available_from', 'DATE'],
    ['maintenance_mode', 'TEXT'], ['maintenance_amount', 'BIGINT'],
    ['deposit_option', 'TEXT'], ['deposit_amount', 'BIGINT'],
    ['lockin_option', 'TEXT'], ['lockin_months', 'INTEGER'],
    ['parking_charges_mode', 'TEXT'], ['painting_charges', 'TEXT'],
    // Sale-only terms
    ['price_includes', "JSONB DEFAULT '[]'::jsonb"], ['other_charges', 'BIGINT'],
    ['booking_amount', 'BIGINT'],
    // A LABEL, not arithmetic — we never compute tax (spec Q3).
    ['tax_included', 'BOOLEAN'],
    // Plot-only
    ['floors_allowed', 'INTEGER'], ['open_sides', 'TEXT'],
    ['road_width_ft', 'NUMERIC'], ['corner_plot', 'BOOLEAN'],
    // Both. "Consulting", never "brokerage" (spec Q4).
    ['consulting_option', 'TEXT'], ['consulting_percent', 'NUMERIC'],
    ['description', 'TEXT'],
    // Operational layer, deliberately trimmed to just these two (spec Q16).
    ['key_access', 'TEXT'], ['owner_contact_id', 'TEXT'],
    // [{ key, kind, w, h, at }] — R2 object keys only, never bytes (C2m).
    ['media', "JSONB DEFAULT '[]'::jsonb"],
    // Quiet, internal — never a "complete your profile" nag (spec Q18).
    ['completeness', 'INTEGER'],
  ];
  for (const [c, t] of cols) {
    await sql.unsafe(`ALTER TABLE crm_properties ADD COLUMN IF NOT EXISTS ${c} ${t}`);
  }

  // Filters and the matching engine hit these; without indexes every filter is
  // a full scan once a tenant has real inventory.
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_crm_props_subtype ON crm_properties (tenant_id, category, subtype)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_crm_props_bhk ON crm_properties (tenant_id, bhk)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_crm_props_deal_status ON crm_properties (tenant_id, deal, status)`);
}

/**
 * The three ledgers, kept separate (see SPRINT.md):
 *   activities   → crm_timeline_events (business timeline, already exists)
 *   notifications→ alerts to a user's inbox
 *   audit_log    → append-only, hash-chained security ledger
 */
async function createLedgerTables(): Promise<void> {
  // Normalize leads.shortlist + leads.feedback JSONB into rows.
  await sql`
    CREATE TABLE IF NOT EXISTS lead_shortlist (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      property_id TEXT NOT NULL,
      verdict TEXT,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (lead_id, property_id)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_lead_shortlist_lead ON lead_shortlist (tenant_id, lead_id);`;

  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (tenant_id, user_id, read);`;

  // Append-only, tamper-evident. seq gives a monotonic order; prev_hash/hash
  // form a chain so no past row can be altered or removed undetected. Never
  // truncated (see resetDatabase).
  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      seq BIGSERIAL PRIMARY KEY,
      tenant_id TEXT,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      actor_label TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      summary TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      ip TEXT,
      user_agent TEXT,
      prev_hash TEXT,
      hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log (tenant_id, created_at);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log (action);`;

  // --------------------------------------------------------------------------
  // ACTIVITIES (docs/specs/contacts-leads.md B4) — a visit/call/meeting with
  // structure: an outcome, a GPS fix, and proof media.
  //
  // Why this is its own table and not another crm_timeline_events row: the
  // spec's derived property views ("visits to this unit", "interested buyers")
  // and the site_visits_done metric all query by property_id and outcome. As
  // real indexed columns those are cheap; buried in a JSONB metadata blob they
  // are not. Remarks and logged calls stay in crm_timeline_events; the two are
  // merged into one feed at read time, so the UI still shows a single timeline.
  //
  // Ownership rule, load-bearing: lead_id OWNS the activity and is NOT NULL.
  // property_id is a REFERENCE ONLY — a visit may concern a unit, but the
  // property record must never accumulate activity of its own. That keeps
  // properties clean and lets the relationship change without mutating them.
  await sql`
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      property_id TEXT,
      type TEXT NOT NULL,
      at TIMESTAMPTZ DEFAULT NOW(),
      agent_id TEXT,
      remark TEXT,
      outcome TEXT,
      photo_key TEXT,
      geo_lat DOUBLE PRECISION,
      geo_lng DOUBLE PRECISION,
      geo_accuracy DOUBLE PRECISION,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities (tenant_id, lead_id, at DESC);`;
  // Drives the derived "visits to this unit" view without scanning JSONB.
  await sql`CREATE INDEX IF NOT EXISTS idx_activities_property ON activities (tenant_id, property_id) WHERE property_id IS NOT NULL;`;
  await sql`CREATE INDEX IF NOT EXISTS idx_activities_agent ON activities (tenant_id, agent_id, type, at DESC);`;
}


/**
 * ============================================================================
 * D1 — Ingestion platform (spec: docs/specs/ingestion.md)
 * ============================================================================
 * Turns "POST arrives → lead appears" into "POST arrives → RAW LANDS → parser
 * (once configured) → lead". The inbox is the point: a provider's first push
 * is exactly what you need in order to write the mapping, and today it is
 * thrown away — the payload is read by a hardcoded alias list and whatever
 * doesn't match is lost, with no record it was ever sent.
 *
 * Two tables, both idempotent and additive.
 *
 * `integrations` is NEW and deliberately not the existing `crm_integrations`,
 * which is a key/config KV store with **no tenant_id at all** — one row per
 * provider for the whole installation. That is fine for "the Exotel API key"
 * in a single-tenant demo and unusable here: per-integration keys are the
 * mechanism that resolves WHICH TENANT a push belongs to, so the table that
 * holds them must be tenant-scoped or the whole model collapses.
 */
export async function migrateIngestionD1(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      -- Hashed for the inbound lookup (see api_key_enc below for the readable
      -- copy). The last4 is what the UI shows at rest.
      api_key_hash TEXT,
      api_key_last4 TEXT,
      -- NULL until someone configures the mapping. Null is the signal that
      -- pushes must stay pending rather than guess at a lead.
      parser_config JSONB,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      created_by TEXT,
      last_received_at TIMESTAMPTZ
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations (tenant_id, active);`;
  // The key, encrypted (AES-256-GCM), so the firm can read it back later.
  // The hash above is still what the inbound lookup uses; this exists only so
  // "what key did we give 99acres?" is answerable without rotating and having
  // to re-brief the portal. Encrypted rather than plaintext: a stolen dump is
  // then useless without the server secret.
  await sql.unsafe(`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS api_key_enc TEXT`);
  // The lookup on every inbound push: hash the presented key, find the row.
  // Unique so one key can never resolve to two tenants.
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_key ON integrations (api_key_hash) WHERE api_key_hash IS NOT NULL;`;

  await sql`
    CREATE TABLE IF NOT EXISTS webhook_inbox (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      integration_id TEXT NOT NULL,
      received_at TIMESTAMPTZ DEFAULT NOW(),
      source_ip TEXT,
      headers JSONB,
      -- The raw body, exactly as sent. Purged at 30 days by the retention job
      -- (data-lifecycle.md) while the row and its lead link are kept, so an
      -- old push still shows in the activity feed without storing the payload
      -- of every lead the firm has ever received.
      raw_body JSONB,
      body_purged_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending',   -- pending·parsed·failed·ignored
      lead_id TEXT,
      error TEXT,
      parsed_at TIMESTAMPTZ
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_inbox_tenant ON webhook_inbox (tenant_id, received_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_inbox_integration ON webhook_inbox (integration_id, received_at DESC);`;
  // "Replay pending" reads exactly this.
  await sql`CREATE INDEX IF NOT EXISTS idx_inbox_pending ON webhook_inbox (tenant_id, status) WHERE status = 'pending';`;

  // The unknown-key log already exists but was installation-wide and unbounded.
  // Keep it minimal by design: no body is ever stored for an unauthenticated
  // caller (spec behaviour 2), so this can only ever hold metadata.
  for (const [col, type] of [['tenant_hint', 'TEXT'], ['path', 'TEXT'], ['count', 'INT DEFAULT 1']] as [string, string][]) {
    await sql.unsafe(`ALTER TABLE ingest_rejects ADD COLUMN IF NOT EXISTS ${col} ${type};`);
  }
  await sql`CREATE INDEX IF NOT EXISTS idx_rejects_at ON ingest_rejects (received_at DESC);`;

  console.log('[Supabase DB] D1 ingestion tables ready (integrations, webhook_inbox).');
}

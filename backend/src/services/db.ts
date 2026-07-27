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
        process.env[match[1]] = val;
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

// Canonical id of the first tenant (Bhumi Propcity). It doubles as the slug the
// frontend already sends in X-Tenant-ID, so tenant_id === slug throughout —
// one value to reason about, no id/slug split.
export const DEFAULT_TENANT_ID = 'bhumi-propcity';

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

    await sql`
      CREATE TABLE IF NOT EXISTS crm_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS crm_integrations (
        key TEXT PRIMARY KEY,
        config JSONB NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS crm_routing_rules (
        id INT PRIMARY KEY DEFAULT 1,
        strategy TEXT DEFAULT 'round_robin',
        active_agent_ids JSONB DEFAULT '[]'::jsonb,
        last_assigned_index INT DEFAULT -1
      );
    `;

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
      'crm_settings', 'crm_integrations', 'crm_routing_rules', 'crm_timeline_events',
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
    await sql`ALTER TABLE crm_integrations DROP CONSTRAINT IF EXISTS crm_integrations_pkey;`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_integrations_tenant_key ON crm_integrations (tenant_id, key);`;
    await sql`ALTER TABLE crm_routing_rules DROP CONSTRAINT IF EXISTS crm_routing_rules_pkey;`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_routing_tenant ON crm_routing_rules (tenant_id);`;

    // Per-tenant PWA identity (installable app manifest + home-screen icons),
    // generated once at onboarding and stored here (icons as base64 PNG).
    await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pwa_config JSONB DEFAULT '{}'::jsonb;`;

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

    console.log('[Supabase DB] ✅ PostgreSQL schema initialization completed successfully.');
  } catch (err: any) {
    console.error('[Supabase DB Error] Failed to initialize database schema:', err.message || err);
    throw err;
  }
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
}

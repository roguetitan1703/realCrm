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

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:KOq5K1p3fgLxsduZ@db.zxdidrhhqtxepyhkging.supabase.co:5432/postgres';

export const sql = postgres(dbUrl, {
  ssl: 'require',
  max: 10,
  idle_timeout: 20,
  connect_timeout: 15,
});

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
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

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

    console.log('[Supabase DB] ✅ PostgreSQL schema initialization completed successfully.');
  } catch (err: any) {
    console.error('[Supabase DB Error] Failed to initialize database schema:', err.message || err);
    throw err;
  }
}

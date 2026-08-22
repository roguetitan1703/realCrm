/**
 * ============================================================================
 * A LOGIN FOR THE DEVELOPMENT ENVIRONMENT
 * ============================================================================
 * WHEN TO RUN THIS: after `npm run seed:dev` on a fresh development database,
 * or any time nothing can sign in to :5001.
 *
 *   npm run seed:dev:login
 *
 * Why it exists: `seed-dev.ts` writes `users` rows with no credential, so the
 * development environment had leads and agents and no way to open a screen.
 * Every UI change went to production unverified — `docs/STATE.md` carried
 * "no UI change from this session has been clicked" as a standing item, on a
 * refactor of the most-used screen in the product.
 *
 * It provisions the `delpat` tenant, which exists for exactly this: the user's
 * own org, fake data end to end, no real person's row in it. NOT `bhumi`, and
 * not a new tenant nobody recognises later.
 *
 * THE PASSWORD IS DELIBERATELY A KNOWN ONE, AND THAT IS ONLY SAFE BECAUSE OF
 * THE GUARD BELOW. `passwordLogin` used to accept '00000000' for any user on
 * any tenant, which meant a login ID was enough to enter a paying client's
 * workspace; that is gone, and this must not become a way back to it. So the
 * script resolves its database through DEV_DATABASE_URL and refuses to run if
 * that names the same Supabase project as DATABASE_URL. A known password on a
 * synthetic tenant in a database with no client data is a test fixture. The
 * same row in production is an incident.
 * ============================================================================
 */
import bcrypt from 'bcryptjs';
import postgres from 'postgres';
import { appEnv, databaseUrl, dbRef } from '../services/env.js';

// Same as seed-dev.ts: default the declaration rather than requiring a shell
// prefix, which is a parse error in PowerShell. The guard that actually bites
// is the ref comparison below — APP_ENV alone proves nothing once defaulted.
process.env.APP_ENV = process.env.APP_ENV || 'development';

const LOGIN_ID = 'akashpatel';
const PASSWORD = '00000000';
const TENANT = 'delpat';

if (appEnv() !== 'development') {
  console.error(`\n✗ APP_ENV is "${appEnv()}", not "development". Refusing.\n  This writes a known password; it exists for the development database only.\n`);
  process.exit(1);
}
const url = databaseUrl();
if (!url) { console.error('✗ No database URL resolved.'); process.exit(1); }
if (process.env.DATABASE_URL && dbRef(url) === dbRef(process.env.DATABASE_URL)) {
  console.error(`\n✗ The development URL resolves to the same project as DATABASE_URL (${dbRef(url)}). Refusing.\n`);
  process.exit(1);
}

const sql = postgres(url, { max: 1, ssl: 'require' });
console.log(`→ development database ${dbRef(url)}`);

const [tenant] = await sql`
  INSERT INTO tenants (id, name, slug)
  VALUES (${TENANT}, 'Delpat', ${TENANT})
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id, slug`;
console.log(`✓ tenant ${tenant.id}`);

// Read before overwriting: if a real password was set here deliberately, say so
// rather than silently resetting it out from under whoever set it.
const [existing] = await sql`
  SELECT id, name, role, password_hash FROM users
  WHERE tenant_id = ${TENANT} AND lower(login_id) = ${LOGIN_ID} LIMIT 1`;
if (existing?.password_hash && !(await bcrypt.compare(PASSWORD, existing.password_hash))) {
  console.log(`! ${LOGIN_ID} already has a DIFFERENT password. Leaving it alone.`);
  await sql.end();
  process.exit(0);
}

const hash = await bcrypt.hash(PASSWORD, 10);
const id = existing?.id || `u_dev_${LOGIN_ID}`;
await sql`
  INSERT INTO users (id, tenant_id, name, login_id, email, role, status, password_hash, must_change_password)
  VALUES (${id}, ${TENANT}, 'Akash Patel', ${LOGIN_ID}, ${LOGIN_ID + '@delpat.in'}, 'owner', 'active', ${hash}, FALSE)
  ON CONFLICT (id) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    status = 'active',
    role = 'owner',
    must_change_password = FALSE,
    deleted_at = NULL,
    failed_logins = 0,
    locked_until = NULL`;

const [check] = await sql`
  SELECT id, name, role, status FROM users WHERE tenant_id = ${TENANT} AND lower(login_id) = ${LOGIN_ID}`;
console.log(`✓ ${check.id} — ${check.name}, ${check.role}, ${check.status}`);
console.log(`\n  http://localhost:5173/${TENANT}   ${LOGIN_ID} / ${PASSWORD}\n`);
await sql.end();

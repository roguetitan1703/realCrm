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
import { pgOptions } from '../services/pgOptions.js';
import { adoptSynthetic } from '../services/devData.js';

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

const sql = postgres(url, pgOptions(url, { max: 1 }));
console.log(`→ development database ${dbRef(url)}`);

const [tenant] = await sql`
  INSERT INTO tenants (id, name, slug)
  VALUES (${TENANT}, 'Delpat', ${TENANT})
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id, slug`;
console.log(`✓ tenant ${tenant.id}`);

await adoptSynthetic(sql, TENANT, 'seed-dev-login');

// Read before overwriting: if a real password was set here deliberately, say so
// rather than silently resetting it out from under whoever set it.
const [existing] = await sql`
  SELECT id, name, role, password_hash FROM users
  WHERE tenant_id = ${TENANT} AND lower(login_id) = ${LOGIN_ID} LIMIT 1`;
if (existing?.password_hash && !(await bcrypt.compare(PASSWORD, existing.password_hash))) {
  console.log(`! ${LOGIN_ID} already has a DIFFERENT password. Leaving it alone.`);
} else {
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
}

// THE REST OF THE DESK: a manager and four agents, the people
// seed-dev-activity writes a working day for and the smoke tests sign in as.
// A login ID already on this firm is left exactly as it is (the shared
// development database has had these people for months, with their own
// passwords); only a missing one is created, with the same known password.
const ROSTER: [string, string, 'manager' | 'agent'][] = [
  ['Siddharth Varma', 'siddharthvarma', 'manager'],
  ['Kavish Shah', 'kavish', 'agent'],
  ['Mohit Jain', 'mohit', 'agent'],
  ['Aniket Rao', 'aniket', 'agent'],
  ['Rupali Desai', 'rupali', 'agent'],
];
const roster: string[] = [];
for (const [name, login, role] of ROSTER) {
  const [had] = await sql`SELECT id, role FROM users WHERE tenant_id = ${TENANT} AND lower(login_id) = ${login} LIMIT 1`;
  if (had) { roster.push(`${login} (${had.role}, already here, left alone)`); continue; }
  const id = `u_dev_${TENANT}_${login}`;
  const first = name.split(' ')[0];
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase();
  // example.invalid can never route mail (RFC 2606), so no alert reaches a person.
  const email = `${login}@example.invalid`;
  const meta = { initials, avatar: '', email };
  await sql`
    INSERT INTO users (id, tenant_id, name, login_id, email, role, status, password_hash, must_change_password, email_verified, metadata)
    VALUES (${id}, ${TENANT}, ${name}, ${login}, ${email}, ${role}, 'active', ${await bcrypt.hash(PASSWORD, 10)}, FALSE, TRUE, ${sql.json(meta)})
    ON CONFLICT (id) DO NOTHING`;
  await sql`
    INSERT INTO crm_agents (id, tenant_id, name, first, initials, avatar, role, duty_status, metadata)
    VALUES (${id}, ${TENANT}, ${name}, ${first}, ${initials}, '', ${role}, 'ACTIVE', ${sql.json(meta)})
    ON CONFLICT (id) DO NOTHING`;
  roster.push(`${login} (${role}, created)`);
}
// New leads from a portal go round the agents, as the team screen does when it
// adds one.
const agentIds = (await sql`SELECT id FROM users WHERE tenant_id = ${TENANT} AND role = 'agent' AND deleted_at IS NULL ORDER BY name`).map((r: any) => r.id);
const [rr] = await sql`SELECT active_agent_ids FROM crm_routing_rules WHERE tenant_id = ${TENANT} LIMIT 1`;
if (!rr) {
  await sql`INSERT INTO crm_routing_rules (strategy, active_agent_ids, last_assigned_index, tenant_id)
            VALUES ('round_robin', ${sql.json(agentIds)}, -1, ${TENANT}) ON CONFLICT (tenant_id) DO NOTHING`;
}
console.log(`✓ desk: ${roster.join(', ')}`);
console.log(`
  http://localhost:5173/${TENANT}   ${LOGIN_ID} / ${PASSWORD}
`);
await sql.end();

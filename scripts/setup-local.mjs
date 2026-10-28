/**
 * The whole CRM on your own machine, against your own Postgres, in one command.
 *
 *   npm run setup:local
 *   npm run setup:local -- --db=postgres://USER:PASSWORD@localhost:5432/realcrm
 *   npm run setup:local -- --reseed        write the demo data again
 *
 * What it does, in order, and safe to run again:
 *   1. checks Node and that a Postgres answers on this machine;
 *   2. creates the database if it is missing;
 *   3. writes `.env` from `.env.local.example` ONLY if there is no `.env`
 *      (a random JWT secret, your database URL, APP_ENV=development);
 *   4. builds the schema, exactly as the API does at boot;
 *   5. seeds the `delpat` demo firm (an owner, a manager, four agents, leads,
 *      owners, flats, a few days of work) once; on a later run it only brings
 *      the dates up to today;
 *   6. prints the address and the logins.
 *
 * LOCAL ONLY. It refuses any database that is not on localhost: it writes
 * known passwords, and a known password belongs on a laptop, nowhere else.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env');
const TEMPLATE = path.join(ROOT, '.env.local.example');
const DEFAULT_DB = 'postgres://postgres:postgres@localhost:5432/realcrm';
const TENANT = 'delpat';
const PASSWORD = '00000000';
const LOGINS = [['Owner', 'akashpatel'], ['Manager', 'siddharthvarma'], ['Agent', 'kavish'], ['Agent', 'mohit'], ['Agent', 'aniket'], ['Agent', 'rupali']];

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const flag = (k) => process.argv.includes(`--${k}`);
const say = (s = '') => console.log(s);
const die = (s) => { console.error(`\n✗ ${s}\n`); process.exit(1); };
const step = (s) => say(`\n▸ ${s}`);

// ── 1. Node ──────────────────────────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const needMajor = Number(String(pkg.engines?.node || '>=20').match(/(\d+)/)?.[1] || 20);
const haveMajor = Number(process.versions.node.split('.')[0]);
step(`Node ${process.versions.node}`);
if (haveMajor < needMajor) die(`Node ${needMajor} or newer is needed (package.json engines: ${pkg.engines?.node}). You have ${process.versions.node}.`);
const TSX = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
if (!fs.existsSync(TSX)) die('Dependencies are not installed. Run `npm install` first.');
const { default: postgres } = await import('postgres');

// ── Which database ───────────────────────────────────────────────────────────
function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const existing = readEnvFile(ENV_FILE);
const hadEnv = fs.existsSync(ENV_FILE);
const asked = arg('db');
if (hadEnv && existing.APP_ENV && existing.APP_ENV !== 'development') {
  die(`.env says APP_ENV=${existing.APP_ENV}. A local setup runs as development. Move that .env aside (it is not a local one) and run this again.`);
}
if (hadEnv && asked && existing.DEV_DATABASE_URL && asked !== existing.DEV_DATABASE_URL) {
  die(`.env already names a database (DEV_DATABASE_URL) and --db names another. The API reads .env, so seeding --db would fill a database nothing uses. Edit DEV_DATABASE_URL in .env, or drop --db.`);
}
const dbUrl = (hadEnv && existing.DEV_DATABASE_URL) || asked || DEFAULT_DB;
let u;
try { u = new URL(dbUrl); } catch { die(`Not a Postgres URL: ${dbUrl}`); }
const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  die(`The database is on ${host}, not this machine. setup:local writes known passwords and only ever touches a local Postgres.`);
}
const dbName = decodeURIComponent(u.pathname.replace(/^\//, '')) || 'realcrm';
if (!/^[A-Za-z0-9_-]+$/.test(dbName)) die(`Use a plain database name (letters, digits, _ and -), not "${dbName}".`);
const shown = (() => { const c = new URL(dbUrl); if (c.password) c.password = '***'; return c.toString(); })();

// ── 1b. Postgres answers ─────────────────────────────────────────────────────
step(`Postgres at ${shown}`);
const maint = new URL(dbUrl); maint.pathname = '/postgres';
const admin = postgres(maint.toString(), { max: 1, ssl: false, onnotice: () => {}, connect_timeout: 8 });
try {
  const [row] = await admin`SHOW server_version_num`;
  const v = Number(row.server_version_num);
  say(`  Postgres ${Math.floor(v / 10000)} answers`);
  if (v < 150000) say('  ! Postgres 15 or newer is what this is tested on.');
  // ── 2. The database ────────────────────────────────────────────────────────
  const [has] = await admin`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
  if (has) say(`  database "${dbName}" exists`);
  else { await admin.unsafe(`CREATE DATABASE "${dbName}"`); say(`  created database "${dbName}"`); }
} catch (e) {
  await admin.end({ timeout: 1 }).catch(() => {});
  const code = e?.code || '';
  if (code === 'ECONNREFUSED' || /ECONNREFUSED|ETIMEDOUT|connect/i.test(String(e?.message))) {
    die([`Nothing answers at ${u.hostname}:${u.port || 5432}. Start Postgres 15+ first, one of:`,
      '    • install it (postgresql.org/download) and start the service, or',
      '    • docker run -d --name realcrm-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16',
      'then run this again (add --db=postgres://USER:PASSWORD@localhost:PORT/realcrm if yours is not postgres/postgres on 5432).'].join('\n'));
  }
  if (code === '28P01' || code === '28000') die(`Postgres refused the user or password in ${shown}. Pass yours: npm run setup:local -- --db=postgres://USER:PASSWORD@localhost:${u.port || 5432}/realcrm`);
  die(`Postgres said: ${e?.message || e}`);
}
await admin.end();

// ── 3. .env ──────────────────────────────────────────────────────────────────
step('.env');
if (hadEnv) {
  say('  .env exists, left as it is');
  if (!existing.DEV_DATABASE_URL) die('.env has no DEV_DATABASE_URL. Add DEV_DATABASE_URL=<your local Postgres URL> to it, or move it aside and run this again.');
  if (!existing.JWT_SECRET) die('.env has no JWT_SECRET. Add one, or move .env aside and run this again.');
} else {
  const rand = (n) => crypto.randomBytes(n).toString('base64url');
  const text = fs.readFileSync(TEMPLATE, 'utf8')
    .replace('{{DEV_DATABASE_URL}}', dbUrl)
    .replace('{{JWT_SECRET}}', rand(48))
    .replace('{{SUPERADMIN_PASSWORD}}', rand(18));
  fs.writeFileSync(ENV_FILE, text);
  say('  wrote .env (random JWT secret, your database, APP_ENV=development)');
}

// The children read .env themselves; the shell must not override it with a
// database from somewhere else, and nothing here has any use for production's.
const childEnv = { ...process.env, APP_ENV: 'development', DEV_DATABASE_URL: dbUrl };
delete childEnv.DATABASE_URL;
const tsx = (script, ...args) => {
  const r = spawnSync(process.execPath, [TSX, path.join('backend', 'src', 'scripts', script), ...args], { cwd: ROOT, env: childEnv, stdio: 'inherit' });
  if (r.status !== 0) die(`${script} ${args.join(' ')} failed (exit ${r.status}). The error is above.`);
};

// ── 4. Schema ────────────────────────────────────────────────────────────────
step('Schema');
tsx('init-db.ts');

// ── 5. Demo firm ─────────────────────────────────────────────────────────────
const db = postgres(dbUrl, { max: 1, ssl: false, onnotice: () => {} });
const seeded = async () => {
  const [r] = await db`
    SELECT (SELECT count(*)::int FROM crm_leads WHERE tenant_id = ${TENANT}) AS leads,
           (SELECT count(*)::int FROM dev_synthetic_tenants WHERE tenant_id = ${TENANT}) AS marked`;
  return r;
};
const before = await seeded();
if (before.marked && before.leads && !flag('reseed')) {
  step(`Demo firm /${TENANT} already seeded (${before.leads} leads): bringing its dates up to today`);
  tsx('dev-refresh.ts');
} else {
  step(`Seeding the demo firm /${TENANT}`);
  tsx('seed-dev-login.ts');
  tsx('seed-dev.ts', `--tenant=${TENANT}`, '--n=160');
  tsx('seed-dev-inventory.ts');
  tsx('seed-dev-activity.ts');
}

// ── 6. What you have ─────────────────────────────────────────────────────────
const [c] = await db`
  SELECT (SELECT count(*)::int FROM crm_leads WHERE tenant_id = ${TENANT}) AS leads,
         (SELECT count(*)::int FROM crm_owners WHERE tenant_id = ${TENANT}) AS owners,
         (SELECT count(*)::int FROM crm_properties WHERE tenant_id = ${TENANT}) AS flats,
         (SELECT count(*)::int FROM crm_leads WHERE tenant_id = ${TENANT} AND follow_up->>'at' ~ '^[0-9]{4}-'
            AND (follow_up->>'at')::timestamptz < now()) AS overdue,
         (SELECT count(*)::int FROM crm_leads WHERE tenant_id = ${TENANT} AND follow_up->>'at' ~ '^[0-9]{4}-'
            AND (follow_up->>'at')::timestamptz >= now()
            AND ((follow_up->>'at')::timestamptz AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date) AS due_today`;
await db.end();

say(`\n✓ Ready. /${TENANT}: ${c.leads} leads, ${c.owners} owners, ${c.flats} flats; ${c.overdue} follow-ups overdue, ${c.due_today} due later today.\n`);
say('  Start it, in two terminals:');
say('    npm run dev:api        API on http://localhost:5001');
say('    npm run dev            app on http://localhost:5173');
say(`\n  Open http://localhost:5173/${TENANT} and sign in (password ${PASSWORD} for all):`);
for (const [role, login] of LOGINS) say(`    ${role.padEnd(8)} ${login}`);
say('');

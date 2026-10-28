/**
 * Build (or bring up to date) the schema of the DEVELOPMENT database, then exit.
 *
 * WHEN TO RUN THIS: `npm run setup:local` runs it for you. By hand, after
 * pulling code that adds a table, if you want the schema before starting the
 * API. It is exactly what the server does at boot (initSchema and every
 * one-time repair, services/store.ts), without serving anything.
 *
 * Development only: a script that migrates must never be one keystroke from
 * production.
 */
process.env.APP_ENV = process.env.APP_ENV || 'development';
const { appEnv, dbRef, databaseUrl } = await import('../services/env.js');
if (appEnv() !== 'development') {
  console.error(`\n✗ APP_ENV is "${appEnv()}", not "development". Refusing to migrate.\n`);
  process.exit(1);
}
console.log(`→ building the schema on ${dbRef(databaseUrl())}`);
const { booted } = await import('../services/store.js');
const ok = await booted;
const { sql } = await import('../services/db.js');
await sql.end({ timeout: 5 });
console.log(ok ? '✓ schema ready' : '✗ the schema did not finish building (the error is above)');
process.exit(ok ? 0 : 1);

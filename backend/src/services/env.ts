/**
 * ============================================================================
 * 🧭 WHICH ENVIRONMENT IS THIS, AND IS IT PLUGGED INTO THE RIGHT DATABASE
 * ============================================================================
 * One paying client's data sits in one of these projects. The failure that
 * matters is not a bug — it is a correct process pointed at the wrong database:
 * a staging backend started with the production URL still in the shell, a
 * seeder run in last night's terminal. Both look completely normal while they
 * run, and neither is noticed until somebody reads a row.
 *
 * NOTHING HERE IS HARDCODED. An earlier version of this file carried the two
 * Supabase project refs as constants, which is a URL baked into the repo — the
 * exact thing that has to be configuration, or the next project needs a code
 * change to exist. The check is between two values the environment already
 * holds: APP_ENV=staging SELECTS StagingDatabaseUrl, so a staging process
 * cannot reach for production's string at all, and the only way left to get it
 * wrong is to point both variables at the same database, which is compared for
 * directly.
 * ============================================================================
 */

export type AppEnv = 'production' | 'staging' | 'local';

/**
 * The Supabase project a connection string points at — used only to COMPARE two
 * configured strings and to name the database in a log line. Two shapes are in
 * use: the direct connection (db.<ref>.supabase.co) and the pooler, which puts
 * the ref in the username (postgres.<ref>).
 */
export function dbRef(url: string | undefined): string {
  if (!url) return '';
  const direct = url.match(/@db\.([a-z0-9]+)\.supabase\.co/i)?.[1];
  if (direct) return direct.toLowerCase();
  const pooled = url.match(/postgres\.([a-z0-9]+):/i)?.[1];
  return (pooled || '').toLowerCase();
}

export function appEnv(): AppEnv {
  const v = String(process.env.APP_ENV || '').toLowerCase();
  if (v === 'production' || v === 'staging' || v === 'local') return v;
  return 'local';
}

export function isProduction(): boolean { return appEnv() === 'production'; }

/**
 * The connection string this process should actually use.
 *
 * ONE env file, one variable to flip. `APP_ENV=staging` selects
 * STAGING_DATABASE_URL; everything else — R2, email, VAPID, JWT — is
 * deliberately shared, because media and mail are not being tested and a second
 * set of credentials nobody exercises is a second set to keep in step.
 *
 * The database is the one thing that must never be shared, so it is the one
 * thing that switches — and the switch refuses to fall back. An unreachable
 * staging database is a much better outcome than a reachable live one.
 */
export function databaseUrl(): string {
  if (appEnv() === 'staging') {
    const staging = process.env.STAGING_DATABASE_URL;
    if (!staging) {
      throw new Error('APP_ENV=staging but STAGING_DATABASE_URL is not set. Refusing to fall back to production.');
    }
    return staging;
  }
  return process.env.DATABASE_URL || '';
}

/**
 * Refuse to run against the wrong database. Called before anything opens a
 * connection; throws, so the process dies at boot instead of half-serving.
 */
let warned = false;
export function assertEnvMatchesDatabase(): void {
  const declared = appEnv();
  const prod = process.env.DATABASE_URL;
  const staging = process.env.STAGING_DATABASE_URL;

  // The one mistake the selection above cannot prevent: both variables pointing
  // at the same database, so "staging" is production wearing a label.
  if (staging && prod && dbRef(staging) && dbRef(staging) === dbRef(prod)) {
    throw new Error(
      `STAGING_DATABASE_URL and DATABASE_URL point at the same project (${dbRef(prod)}). ` +
      `Refusing to start: one of them is wrong, and running would put test data on a live desk.`,
    );
  }
  if (declared === 'staging' && !staging) {
    throw new Error('APP_ENV=staging but STAGING_DATABASE_URL is not set. Refusing to fall back to production.');
  }
  // Undeclared is LOUD BUT NOT FATAL, deliberately. An existing deploy that
  // predates this variable is not the mistake worth stopping, and a guard that
  // takes the live API down because someone forgot an env var on a hand-rolled
  // deploy costs more than it ever saves.
  if (!process.env.APP_ENV && !warned) {
    warned = true;
    console.warn(
      `\n⚠️  APP_ENV is not set; treating this process as local (db ${dbRef(prod) || 'unknown'}).` +
      `\n    Set APP_ENV=production or APP_ENV=staging so the check can do its job.\n`,
    );
  }
}

/** One line at boot saying what this process is and what it is holding. */
export function envBanner(port: string | number): string {
  const env = appEnv();
  const mark = env === 'production' ? '🔴 PRODUCTION' : env === 'staging' ? '🟡 STAGING' : '⚪ LOCAL';
  return `${mark} · port ${port} · db ${dbRef(databaseUrl()) || 'unknown'}`;
}

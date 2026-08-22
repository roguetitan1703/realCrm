/**
 * ============================================================================
 * 🧭 WHICH ENVIRONMENT IS THIS, AND IS IT PLUGGED INTO THE RIGHT DATABASE
 * ============================================================================
 * One paying client's data sits in one of these projects. The failure that
 * matters is not a bug — it is a correct process pointed at the wrong database:
 * a staging backend started with the production URL still in the shell, or a
 * production deploy that picked up a staging env file. Both look completely
 * normal while they run, and neither is noticed until somebody reads a row.
 *
 * So the environment is DECLARED (`APP_ENV`) and then CHECKED against the
 * database the process is actually about to talk to. A Supabase connection
 * string carries its project ref, so the two can be compared before a single
 * query runs, and a mismatch stops the boot rather than logging a warning
 * nobody reads.
 *
 * Refs are not secrets — they are the hostname of a database that still needs a
 * password — so they live here where a reviewer can see which is which, rather
 * than in an env var that can drift to match whatever mistake is being made.
 * ============================================================================
 */

export type AppEnv = 'production' | 'staging' | 'local';

const REFS: Record<string, AppEnv> = {
  zxdidrhhqtxepyhkging: 'production',
  hziiyelgcfsgokdegicd: 'staging',
};

/** The Supabase project a connection string points at, or '' if it isn't one. */
export function dbRef(url: string | undefined): string {
  if (!url) return '';
  // Two shapes, both in use: the direct connection (db.<ref>.supabase.co) and
  // the pooler, which puts the ref in the USERNAME (postgres.<ref>).
  const host = url.match(/@db\.([a-z0-9]+)\.supabase\.co/i)?.[1];
  if (host) return host.toLowerCase();
  const pooled = url.match(/postgres\.([a-z0-9]+):/i)?.[1];
  return (pooled || '').toLowerCase();
}

export function appEnv(): AppEnv {
  const v = String(process.env.APP_ENV || '').toLowerCase();
  if (v === 'production' || v === 'staging' || v === 'local') return v;
  // UNDECLARED IS NOT "PROBABLY PRODUCTION". Guessing here is how a staging
  // process ends up trusted with production's rules; the ref decides, and an
  // unknown ref is local.
  return REFS[dbRef(process.env.DATABASE_URL)] || 'local';
}

export function isProduction(): boolean { return appEnv() === 'production'; }

/**
 * The connection string this process should actually use.
 *
 * ONE env file, one variable to flip. `APP_ENV=staging` selects
 * STAGING_DATABASE_URL; everything else — R2, email, VAPID — is deliberately
 * shared, because the client is not testing media or mail and a second set of
 * credentials nobody exercises is a second set to keep in step.
 *
 * The database is the one thing that must never be shared, so it is the one
 * thing that switches.
 */
export function databaseUrl(): string {
  if (String(process.env.APP_ENV || '').toLowerCase() === 'staging') {
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
export function assertEnvMatchesDatabase(): void {
  const declared = String(process.env.APP_ENV || '').toLowerCase() as AppEnv | '';
  const ref = dbRef(databaseUrl());
  const actual = REFS[ref];

  if (declared && actual && declared !== actual) {
    throw new Error(
      `APP_ENV is "${declared}" but DATABASE_URL points at the ${actual} project (${ref}). ` +
      `Refusing to start. This is the check that stops a staging process writing to a live desk.`,
    );
  }
  // Undeclared against production is LOUD BUT NOT FATAL, deliberately.
  //
  // The mistake worth stopping is a process that says one thing and is plugged
  // into another — that is caught above. An existing production deploy that
  // simply predates this variable is not that mistake, and a guard that takes
  // the live API down because someone forgot an env var on a hand-rolled deploy
  // has cost the client more than it ever saved.
  if (!declared && actual === 'production') {
    console.warn(
      `
⚠️  APP_ENV is not set and DATABASE_URL points at PRODUCTION (${ref}).` +
      `
    Set APP_ENV=production on this process so the check can do its job.
`,
    );
  }
}

/** One line at boot saying what this process is and what it is holding. */
export function envBanner(port: string | number): string {
  const ref = dbRef(databaseUrl());
  const env = appEnv();
  const mark = env === 'production' ? '🔴 PRODUCTION' : env === 'staging' ? '🟡 STAGING' : '⚪ LOCAL';
  return `${mark} · port ${port} · db ${ref || 'unknown'}`;
}

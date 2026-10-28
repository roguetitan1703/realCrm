/**
 * How to open a connection to a given Postgres URL. Deliberately its own
 * module with no imports and no side effects: services/env.ts loads .env files
 * the moment it is imported, and several scripts choose WHICH env file by
 * setting APP_ENV first and importing env.ts afterwards. A script that only
 * needs these options must not load configuration as a side effect.
 */

/** A database on this machine: localhost, 127.0.0.1 or ::1. */
export function isLocalDatabase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch { return false; }
}

/**
 * The connection options every postgres() call in this repo uses.
 *
 * SSL FOR A REMOTE HOST, NONE FOR THIS MACHINE. Supabase refuses a plain
 * connection, and a stock local Postgres refuses an SSL one ("The server does
 * not support SSL connections"), so `ssl: 'require'` written at each call site
 * meant nothing in this repo could talk to a database on a laptop. One answer,
 * here, for every script and the server.
 */
export function pgOptions<T extends object>(url: string | undefined, extra: T): T & { ssl: 'require' | false } {
  return { ...extra, ssl: isLocalDatabase(url) ? false : 'require' };
}

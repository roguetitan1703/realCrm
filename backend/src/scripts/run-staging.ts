/**
 * Start the backend against STAGING, on port 5001.
 *
 *   npm run dev:backend:staging
 *
 * Exists because setting an env var inline is shell-specific — `APP_ENV=x cmd`
 * is a parse error in PowerShell, which is where this gets run locally, and the
 * EC2 box runs bash. One script, both shells, and the two variables that decide
 * WHICH DATABASE are set in one visible place rather than typed from memory
 * next to a production connection string.
 *
 * Everything else (R2, email, VAPID, JWT) is shared with production on purpose:
 * media and mail are not being tested, and a second set of credentials nobody
 * exercises is a second set to keep in step. The database is the one thing that
 * must never be shared, so it is the one thing this switches.
 */
import { spawn } from 'child_process';
import path from 'path';

process.env.APP_ENV = 'staging';
process.env.PORT = process.env.PORT || '5001';

if (!process.env.STAGING_DATABASE_URL) {
  console.error('\nSTAGING_DATABASE_URL is not set.');
  console.error('Add it to .env — the staging Supabase pooler string.');
  console.error('Refusing to start: without it this would fall back to production.\n');
  process.exit(1);
}

const entry = path.join(__dirname, '..', 'index.ts');
const child = spawn('npx', ['tsx', 'watch', entry], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 0));

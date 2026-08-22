/**
 * Start the API in a named environment. One script, both shells, no hunting.
 *
 *   npm run dev:api            development db, port 5001, watch     (local work)
 *   npm run dev:api:prod       production db,  port 5000, watch     (deliberate)
 *   npm run start:api          production db,  port 5000            (EC2)
 *   npm run start:api:dev      development db, port 5001            (EC2, on demand)
 *
 * Exists because setting an env var inline is shell-specific — `APP_ENV=x cmd`
 * is a parse error in PowerShell, which is where this runs locally, and the EC2
 * box runs bash. The two variables that decide WHICH DATABASE are set here, in
 * one visible place, rather than typed from memory next to a production
 * connection string at eleven at night.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];

const env = (arg('env') || 'development').toLowerCase();
if (env !== 'production' && env !== 'development') {
  console.error(`\nUnknown --env=${env}. Use production or development.\n`);
  process.exit(1);
}

process.env.APP_ENV = env;
// Production keeps 5000, development takes 5001, so both can run on one box and
// nothing has to be stopped to look at the other.
process.env.PORT = arg('port') || process.env.PORT || (env === 'production' ? '5000' : '5001');

const watch = process.argv.includes('--watch');
// This package is ESM, so __dirname does not exist. Resolved from the module's
// own URL instead, which also survives being run from any working directory.
const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(here, '..', 'index.ts');
const child = spawn('npx', ['tsx', ...(watch ? ['watch'] : []), entry], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 0));

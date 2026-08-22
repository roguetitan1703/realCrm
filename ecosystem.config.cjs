/**
 * ============================================================================
 * PM2 — WHAT PRODUCTION ACTUALLY RUNS
 * ============================================================================
 * Committed because the start command used to live only inside one box's PM2
 * daemon, where nobody could read it. On 2026-08-22 the API was down for eight
 * hours and diagnosing why required SSHing in to ask `pm2 describe` what it had
 * been told to run. The answer was `npm run dev:backend` — `tsx watch`.
 *
 * THREE THINGS THAT COMBINATION BROKE, all of which this file exists to stop:
 *
 * 1. `tsx watch` is a supervisor that SURVIVES ITS CHILD CRASHING, on purpose —
 *    that is what makes it useful while you are editing. In production it meant
 *    the API died and the watcher sat waiting for a file change that was never
 *    coming. npm stayed up because the watcher did; PM2 stayed `online` because
 *    npm did. PM2's autorestart was never broken (53 restarts prove it fires) —
 *    nothing it was watching had exited. Here PM2 runs the API as ITS OWN
 *    process, so the thing being supervised is the thing that can die.
 *
 * 2. APP_ENV was never set, so appEnv() returned 'local'. The database was
 *    still right — databaseUrl() falls through to DATABASE_URL — but
 *    `.env.production` was never loaded, the boot banner claimed "local", and
 *    assertEnvMatchesDatabase() dropped to a warning. The guard written to stop
 *    a process running against the wrong database was off in the one place it
 *    matters. Declared here, so it cannot be forgotten by whoever last typed a
 *    pm2 command.
 *
 * 3. Watch mode in production means the API restarts on any file touch, so
 *    `git pull` during a deploy was what actually picked up new code. Deploys
 *    worked by accident. Without the watcher, `pm2 restart re-api` is what
 *    reloads the code — which is already what deploy.sh calls.
 *
 * Run it with:  pm2 delete re-api && pm2 start ecosystem.config.cjs && pm2 save
 * `pm2 save` matters — without it none of this survives a reboot.
 * ============================================================================
 */
module.exports = {
  apps: [
    {
      name: 're-api',
      cwd: '/home/ubuntu/realestate',

      // ONE process. `node --import tsx <entry>` runs TypeScript in-process
      // instead of spawning a child the way `npx tsx` and `tsx watch` do, so
      // PM2's pid IS the API's pid. Any wrapper in between is another thing
      // that can stay alive while the server behind it is dead.
      script: 'backend/src/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      exec_mode: 'fork',

      // Never in production. See (1) above.
      watch: false,

      env: {
        // See (2). Without this the environment is 'local' and the
        // wrong-database check cannot do its job.
        APP_ENV: 'production',
        PORT: '5000',
        // index.ts also starts on its own isMain check; this makes it explicit
        // rather than dependent on how argv[1] happens to be spelled.
        START_SERVER: 'true',
      },

      autorestart: true,
      // Back off instead of hammering: a database that is down stays down for
      // minutes, and 200ms restarts turn one outage into a log nobody can read.
      exp_backoff_restart_delay: 200,
      // A process that cannot stay up for 30s is not going to be fixed by a
      // 21st restart. Give up loudly so the health check has something to see.
      min_uptime: '30s',
      max_restarts: 20,
      // Let in-flight requests finish before SIGKILL on a deploy restart.
      kill_timeout: 8000,

      // PM2 stamps its own timestamp on every line. The app logs its own on
      // request lines but not on crashes, which is exactly when the time
      // matters — reconstructing this outage depended on guessing from the
      // last request logged before the silence.
      time: true,
    },
  ],
};

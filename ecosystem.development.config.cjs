/**
 * ============================================================================
 * PM2 — THE DEVELOPMENT BACKEND, ALONGSIDE PRODUCTION ON THE SAME BOX
 * ============================================================================
 * A SEPARATE FILE, not a second app inside ecosystem.config.cjs, because
 * `pm2 start ecosystem.config.cjs` in the production directory would then also
 * try to start this one against a cwd that does not exist there. One file per
 * checkout, each naming only what that checkout runs.
 *
 * Production keeps 5000 and `re-api`; development takes 5001 and `re-api-dev`,
 * so both run without either being stopped, and `pm2 list` names which is which.
 *
 * Same shape as production for the same reasons (see ecosystem.config.cjs):
 * one process, no `npm run`, no `tsx watch`, no wrapper that outlives a crash.
 *
 *   cd ~/realestate-dev
 *   pm2 start ecosystem.development.config.cjs && pm2 save
 *   pm2 logs re-api-dev --lines 30      # expect 🟡 DEVELOPMENT · port 5001
 *
 * The banner is the check. If it says PRODUCTION or local, stop — APP_ENV is
 * not reaching the process and this is pointed at the client's database.
 * ============================================================================
 */
module.exports = {
  apps: [
    {
      name: 're-api-dev',
      // The SECOND checkout. Not ~/realestate, which is production on main.
      cwd: '/home/ubuntu/realestate-dev',
      script: 'backend/src/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      exec_mode: 'fork',
      watch: false,
      env: {
        // Selects DEV_DATABASE_URL and refuses to fall back to production.
        APP_ENV: 'development',
        PORT: '5001',
        START_SERVER: 'true',
      },
      autorestart: true,
      exp_backoff_restart_delay: 200,
      min_uptime: '30s',
      max_restarts: 20,
      kill_timeout: 8000,
      time: true,
    },
  ],
};

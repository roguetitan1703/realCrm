# Database backup & restore

No-cost logical backups (`pg_dump`) for the Real Estate by Delpat database.
A plain file you own — no paid Supabase tier, no cloud storage required.

Both scripts read the connection from `DATABASE_URL` (environment or `.env`).
No credential is hardcoded. Run them from anywhere; they `cd` to the repo root.

## Back up

```bash
./scripts/db-backup.sh          # interactive: pick source, writes backups/*.sql.gz
./scripts/db-backup.sh --cron   # non-interactive: dumps DATABASE_URL straight away
```

Output: `backups/realcrm_<source>_<timestamp>.sql.gz` — gzipped, `public` schema
only (our CRM tables + `tenants`; Supabase's own `auth`/`storage`/`realtime` are
left out so the dump stays portable and restores cleanly).

## Restore

```bash
./scripts/db-restore.sh
```

Pick a file, pick a target, confirm. **Destructive** — it drops and recreates
the `public` schema so the target becomes exactly the backup. Restoring onto the
`.env` database requires typing `RESTORE` in full.

## Nightly automation (no cost)

Linux/macOS cron — 2am daily, keep 14 days:

```cron
0 2 * * * cd /path/to/realCrm && ./scripts/db-backup.sh --cron && find backups -name '*.sql.gz' -mtime +14 -delete
```

Windows Task Scheduler: run `bash scripts/db-backup.sh --cron` on a daily
trigger (Git Bash or WSL provides `bash`/`pg_dump`).

## Notes

- **Supabase:** use the **direct** connection (`db.<ref>.supabase.co:5432`), not
  the pooler on `6543` — pgbouncer can't serve `pg_dump`. SSL is added
  automatically (`sslmode=require`).
- **pg_dump version** must be ≥ the server's major version. If the host lacks
  `pg_dump`/`psql`, both scripts fall back to a Docker image (`PG_IMAGE`, default
  `postgres:16-alpine`).
- Dumps contain live data and are **gitignored** (`backups/`). Keep them
  somewhere safe; a dump is the whole business.

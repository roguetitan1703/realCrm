#!/usr/bin/env bash
# =============================================================================
# Real Estate by Delpat — database backup
# =============================================================================
# Logical pg_dump of the Postgres database to backups/. No paid tier, no cloud
# object storage — a plain file you own. Pairs with db-restore.sh.
#
# Source of truth for the connection is DATABASE_URL (read from the environment
# or ./.env) — NOT hardcoded, so no credential lives in this file.
#
# Usage:
#   ./scripts/db-backup.sh            # interactive: pick source, confirm
#   ./scripts/db-backup.sh --cron     # non-interactive: dump DATABASE_URL now
#                                      # (for a nightly cron / scheduled task)
#
# Notes for Supabase:
#   • Use the DIRECT connection (host db.<ref>.supabase.co, port 5432).
#     The pooler on port 6543 (pgbouncer) does NOT support pg_dump.
#   • SSL is required; the script appends sslmode=require if missing.
#   • pg_dump must be >= the server's major version. Host has pg_dump 18 here,
#     which dumps any current Supabase server fine.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."   # run from repo root regardless of caller's cwd

PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"   # only used if host pg_dump is absent

# --- read DATABASE_URL from env, else from .env -----------------------------
load_env_url() {
  if [ -n "${DATABASE_URL:-}" ]; then echo "$DATABASE_URL"; return; fi
  if [ -f .env ]; then
    grep -E '^[[:space:]]*(export[[:space:]]+)?DATABASE_URL=' .env \
      | tail -n1 | sed -E 's/^[[:space:]]*(export[[:space:]]+)?DATABASE_URL=//' \
      | sed -E 's/^["'\'']//; s/["'\'']$//'
  fi
}

# --- guarantee SSL for remote hosts -----------------------------------------
ensure_ssl() {
  local url="$1"
  case "$url" in
    *sslmode=*) echo "$url" ;;
    *localhost*|*127.0.0.1*) echo "$url" ;;                 # local needs no SSL
    *\?*) echo "${url}&sslmode=require" ;;
    *)    echo "${url}?sslmode=require" ;;
  esac
}

mask() { sed -E 's#(://[^:]+:)[^@]+(@)#\1****\2#'; }

ENV_URL="$(load_env_url)"

if [ "${1:-}" = "--cron" ] || [ "${1:-}" = "-y" ]; then
  [ -n "$ENV_URL" ] || { echo "✖ DATABASE_URL not set in env or .env."; exit 1; }
  DB_URL="$ENV_URL"; SRC_NAME="prod"
else
  echo "============================================="
  echo "Select backup source:"
  echo "  1) DATABASE_URL from .env  ($(echo "${ENV_URL:-<not set>}" | mask))"
  echo "  2) Custom connection URL"
  echo "============================================="
  read -r -p "Choose source (1-2): " SRC_CHOICE
  case "$SRC_CHOICE" in
    1) [ -n "$ENV_URL" ] || { echo "✖ DATABASE_URL not set."; exit 1; }
       DB_URL="$ENV_URL"; SRC_NAME="prod" ;;
    2) read -r -p "Enter connection URL: " DB_URL; SRC_NAME="custom" ;;
    *) echo "Invalid choice. Exiting."; exit 1 ;;
  esac
fi

DB_URL="$(ensure_ssl "$DB_URL")"
mkdir -p backups
TS="$(date +%Y%m%d_%H%M%S)"
OUT="backups/realcrm_${SRC_NAME}_${TS}.sql.gz"

echo "---------------------------------------------"
echo "Source : $(echo "$DB_URL" | mask)"
echo "Target : $OUT"
echo "---------------------------------------------"
echo "Backing up…"

# pipefail makes the exit status reflect pg_dump, not gzip.
# -n public: dump only OUR schema. Supabase manages auth/storage/realtime
# itself — including them would conflict on restore and isn't our data anyway.
if command -v pg_dump >/dev/null 2>&1; then
  pg_dump --no-owner --no-privileges -n public -d "$DB_URL" | gzip -9 > "$OUT"
elif command -v docker >/dev/null 2>&1; then
  echo "(host pg_dump not found — using $PG_IMAGE)"
  docker run --rm -i "$PG_IMAGE" pg_dump --no-owner --no-privileges -n public -d "$DB_URL" | gzip -9 > "$OUT"
else
  echo "✖ Neither pg_dump nor docker is available. Install PostgreSQL client tools."
  exit 1
fi

SIZE="$(du -h "$OUT" | cut -f1)"
echo "============================================="
echo "✔ Backup complete — $OUT ($SIZE)"
echo "============================================="

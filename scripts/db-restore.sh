#!/usr/bin/env bash
# =============================================================================
# Real Estate by Delpat — database restore
# =============================================================================
# Restores a dump produced by db-backup.sh (.sql or .sql.gz) into a target
# database. DESTRUCTIVE: it drops and recreates the public schema first, so the
# target ends up exactly as the backup — nothing older survives.
#
# Usage:
#   ./scripts/db-restore.sh
#
# Safety: restoring onto the prod DATABASE_URL requires typing RESTORE in full.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"

load_env_url() {
  if [ -n "${DATABASE_URL:-}" ]; then echo "$DATABASE_URL"; return; fi
  if [ -f .env ]; then
    grep -E '^[[:space:]]*(export[[:space:]]+)?DATABASE_URL=' .env \
      | tail -n1 | sed -E 's/^[[:space:]]*(export[[:space:]]+)?DATABASE_URL=//' \
      | sed -E 's/^["'\'']//; s/["'\'']$//'
  fi
}
ensure_ssl() {
  local url="$1"
  case "$url" in
    *sslmode=*) echo "$url" ;;
    *localhost*|*127.0.0.1*) echo "$url" ;;
    *\?*) echo "${url}&sslmode=require" ;;
    *)    echo "${url}?sslmode=require" ;;
  esac
}
mask() { sed -E 's#(://[^:]+:)[^@]+(@)#\1****\2#'; }

# psql wrapper: host psql if present, else a docker container.
run_psql() {
  if command -v psql >/dev/null 2>&1; then
    psql "$@"
  elif command -v docker >/dev/null 2>&1; then
    docker run --rm -i "$PG_IMAGE" psql "$@"
  else
    echo "✖ Neither psql nor docker is available." >&2; exit 1
  fi
}

# --- pick a backup file ------------------------------------------------------
shopt -s nullglob
FILES=(backups/*.sql.gz backups/*.sql)
shopt -u nullglob
if [ ${#FILES[@]} -eq 0 ]; then
  echo "✖ No backups found in backups/ (expected *.sql or *.sql.gz). Run db-backup.sh first."
  exit 1
fi

echo "============================================="
echo "Select the backup to restore:"
echo "---------------------------------------------"
PS3="Choose file number: "
select BACKUP_FILE in "${FILES[@]}"; do
  [ -n "${BACKUP_FILE:-}" ] && break
  echo "Invalid selection."
done
echo "Selected: $BACKUP_FILE"

# --- pick a target -----------------------------------------------------------
ENV_URL="$(load_env_url)"
echo "---------------------------------------------"
echo "Restore target:"
echo "  1) DATABASE_URL from .env  ($(echo "${ENV_URL:-<not set>}" | mask))"
echo "  2) Custom connection URL"
read -r -p "Choose target (1-2): " TGT
case "$TGT" in
  1) [ -n "$ENV_URL" ] || { echo "✖ DATABASE_URL not set."; exit 1; }
     DB_URL="$ENV_URL"; IS_PROD=1 ;;
  2) read -r -p "Enter connection URL: " DB_URL; IS_PROD=0 ;;
  *) echo "Invalid choice. Exiting."; exit 1 ;;
esac
DB_URL="$(ensure_ssl "$DB_URL")"

echo "---------------------------------------------"
echo "⚠  This will DROP and recreate the public schema on:"
echo "     $(echo "$DB_URL" | mask)"
echo "   Everything currently in that database will be replaced by the backup."
echo "---------------------------------------------"
if [ "$IS_PROD" = "1" ]; then
  read -r -p "Type RESTORE to confirm overwriting the .env database: " CONFIRM
  [ "$CONFIRM" = "RESTORE" ] || { echo "Cancelled."; exit 0; }
else
  read -r -p "Proceed? (y/N): " CONFIRM
  [[ "$CONFIRM" =~ ^[yY]$ ]] || { echo "Cancelled."; exit 0; }
fi

echo "Resetting schema…"
run_psql -v ON_ERROR_STOP=1 -d "$DB_URL" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

# The dump also carries "CREATE SCHEMA public;" (pg_dump emits it since PG15).
# We just recreated the schema, so strip that one line — otherwise the restore
# aborts on "schema public already exists" under ON_ERROR_STOP. Everything else
# in the dump is kept, and any real error still stops the restore.
echo "Restoring…"
strip_schema='/^CREATE SCHEMA public;$/d'
case "$BACKUP_FILE" in
  *.gz) gunzip -c "$BACKUP_FILE" | sed "$strip_schema" | run_psql -q -v ON_ERROR_STOP=1 -d "$DB_URL" ;;
  *)    sed "$strip_schema" "$BACKUP_FILE" | run_psql -q -v ON_ERROR_STOP=1 -d "$DB_URL" ;;
esac

echo "============================================="
echo "✔ Restore complete."
echo "============================================="

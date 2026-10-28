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
# Every dump is verified (gzip -t, CREATE + COPY for crm_leads, minimum size)
# before it is kept. With --cron, the newest KEEP dumps from the same source are
# then kept and older ones deleted — only files named exactly like this script's
# own output, and never when the new dump failed verification.
#
# Environment (all optional):
#   KEEP=14             dumps to keep per source under --cron
#   MIN_BYTES=10000     a verified dump must be at least this big
#   BACKUP_NAME=prod    source label in the file name (rotation is per label)
#   BACKUP_COPY_TO=     off-box copy of the verified dump: an rsync/scp target
#                       such as user@host:/srv/backups/ . Unset = no copy.
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
KEEP="${KEEP:-14}"
MIN_BYTES="${MIN_BYTES:-10000}"
BACKUP_NAME="${BACKUP_NAME:-prod}"
CRON_MODE=0

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
  DB_URL="$ENV_URL"; SRC_NAME="$BACKUP_NAME"; CRON_MODE=1
else
  echo "============================================="
  echo "Select backup source:"
  echo "  1) DATABASE_URL from .env  ($(echo "${ENV_URL:-<not set>}" | mask))"
  echo "  2) Custom connection URL"
  echo "============================================="
  read -r -p "Choose source (1-2): " SRC_CHOICE
  case "$SRC_CHOICE" in
    1) [ -n "$ENV_URL" ] || { echo "✖ DATABASE_URL not set."; exit 1; }
       DB_URL="$ENV_URL"; SRC_NAME="$BACKUP_NAME" ;;
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

# The dump goes to a .tmp name first: a dump that dies half way must never carry
# a name that rotation or a restore would take for a real backup.
TMP="${OUT}.tmp"
trap 'rm -f "$TMP"' EXIT

# pipefail makes the exit status reflect pg_dump, not gzip.
# -n public: dump only OUR schema. Supabase manages auth/storage/realtime
# itself — including them would conflict on restore and isn't our data anyway.
if command -v pg_dump >/dev/null 2>&1; then
  pg_dump --no-owner --no-privileges -n public -d "$DB_URL" | gzip -9 > "$TMP"
elif command -v docker >/dev/null 2>&1; then
  echo "(host pg_dump not found — using $PG_IMAGE)"
  docker run --rm -i "$PG_IMAGE" pg_dump --no-owner --no-privileges -n public -d "$DB_URL" | gzip -9 > "$TMP"
else
  echo "✖ Neither pg_dump nor docker is available. Install PostgreSQL client tools."
  exit 1
fi

# --- verify before it is kept, and before anything old is deleted ------------
verify() {
  local f="$1" bytes
  gzip -t "$f" 2>/dev/null || { echo "✖ verify: not a valid gzip file"; return 1; }
  bytes="$(wc -c < "$f" | tr -d ' ')"
  [ "$bytes" -ge "$MIN_BYTES" ] || { echo "✖ verify: only $bytes bytes (minimum $MIN_BYTES)"; return 1; }
  # grep -c reads to the end, so no SIGPIPE under pipefail.
  [ "$(gzip -dc "$f" | grep -c '^CREATE TABLE public\.crm_leads ')" -ge 1 ] \
    || { echo "✖ verify: no CREATE TABLE for crm_leads"; return 1; }
  [ "$(gzip -dc "$f" | grep -c '^COPY public\.crm_leads ')" -ge 1 ] \
    || { echo "✖ verify: no COPY for crm_leads"; return 1; }
}
if ! verify "$TMP"; then
  echo "✖ Backup FAILED verification — discarded. Older backups were left untouched."
  exit 1
fi
mv "$TMP" "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "============================================="
echo "✔ Backup complete and verified — $OUT ($SIZE)"
echo "============================================="

COPY_FAILED=0
if [ -n "${BACKUP_COPY_TO:-}" ]; then
  echo "Copying off-box to $BACKUP_COPY_TO …"
  if command -v rsync >/dev/null 2>&1; then
    rsync -q "$OUT" "$BACKUP_COPY_TO" || COPY_FAILED=1
  else
    scp -q "$OUT" "$BACKUP_COPY_TO" || COPY_FAILED=1
  fi
  if [ "$COPY_FAILED" = 0 ]; then echo "✔ Off-box copy done."
  else echo "✖ Off-box copy to $BACKUP_COPY_TO FAILED (the local dump is fine)."; fi
fi

# --- rotation: --cron only; own files only; newest KEEP stay -----------------
if [ "$CRON_MODE" = 1 ]; then
  case "$KEEP" in ''|*[!0-9]*) echo "✖ KEEP must be a number, got '$KEEP' — nothing deleted."; exit 1 ;; esac
  [ "$KEEP" -ge 1 ] || { echo "✖ KEEP must be at least 1 — nothing deleted."; exit 1; }
  # The timestamp is in the name, so a reverse name sort is newest first.
  OLD="$(for f in backups/realcrm_"${SRC_NAME}"_[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]_[0-9][0-9][0-9][0-9][0-9][0-9].sql.gz; do
           [ -f "$f" ] && echo "$f"; done | sort -r | tail -n +"$((KEEP + 1))")"
  for f in $OLD; do rm -f -- "$f" && echo "Rotated out: $f"; done
fi

[ "$COPY_FAILED" = 0 ] || exit 1

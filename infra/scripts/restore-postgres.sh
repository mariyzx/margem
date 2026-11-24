#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path-to-backup.dump.age>" >&2
  exit 1
fi

ENC_FILE="$1"
: "${BACKUP_AGE_KEY_FILE:?BACKUP_AGE_KEY_FILE is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${TARGET_DB:?TARGET_DB is required}"

COMPOSE_FILE="${COMPOSE_FILE:-infra/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env}"
TMP_DIR="$(mktemp -d)"
RAW_DUMP="${TMP_DIR}/restore.dump"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

age -d -i "$BACKUP_AGE_KEY_FILE" -o "$RAW_DUMP" "$ENC_FILE"

cat "$RAW_DUMP" | docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$TARGET_DB" --clean --if-exists --no-owner

echo "Restore completed into database: ${TARGET_DB}"
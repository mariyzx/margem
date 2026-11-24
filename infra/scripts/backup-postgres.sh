#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
: "${BACKUP_S3_ENDPOINT:?BACKUP_S3_ENDPOINT is required}"

COMPOSE_FILE="${COMPOSE_FILE:-infra/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TMP_DIR="$(mktemp -d)"
RAW_DUMP="${TMP_DIR}/margem-${TIMESTAMP}.dump"
ENC_DUMP="${RAW_DUMP}.age"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$RAW_DUMP"

age -r "$BACKUP_AGE_RECIPIENT" -o "$ENC_DUMP" "$RAW_DUMP"

aws s3 cp "$ENC_DUMP" "s3://${BACKUP_S3_BUCKET}/postgres/margem-${TIMESTAMP}.dump.age" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" \
  --only-show-errors

echo "Backup encrypted and uploaded: postgres/margem-${TIMESTAMP}.dump.age"
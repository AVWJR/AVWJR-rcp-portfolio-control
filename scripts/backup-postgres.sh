#!/usr/bin/env bash
# Nightly logical backup of the Neon (or any Postgres) database.
# Uses DIRECT_URL when set so pg_dump does not go through the pooled host.
set -euo pipefail

OUT="${1:?Pass the output path, for example backups/rcp.sql.enc}"
URL="${DIRECT_URL:-${DATABASE_URL:-${SOURCE_DATABASE_URL:-}}}"

if [[ -z "$URL" ]]; then
  echo "Set DIRECT_URL (preferred) or DATABASE_URL to the Neon connection string." >&2
  exit 1
fi
if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
  echo "Set BACKUP_ENCRYPTION_KEY to a long passphrase. The dump is encrypted with it." >&2
  exit 1
fi
if [[ "$URL" == *"-pooler"* ]]; then
  echo "This URL looks pooled. pg_dump is more reliable with DIRECT_URL (the host without -pooler)." >&2
fi

mkdir -p "$(dirname "$OUT")"
pg_dump --no-owner --no-acl --format=plain "$URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_ENCRYPTION_KEY -out "$OUT"
echo "Wrote encrypted backup to $OUT"

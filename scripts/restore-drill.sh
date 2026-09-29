#!/usr/bin/env bash
# Prove backup + restore against a scratch Postgres. Does not touch Neon.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_DATABASE_URL="${SOURCE_DATABASE_URL:-${DATABASE_URL:-}}"
TARGET_DATABASE_URL="${TARGET_DATABASE_URL:-}"

if [[ -z "$SOURCE_DATABASE_URL" || -z "$TARGET_DATABASE_URL" ]]; then
  echo "Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL to two scratch databases." >&2
  exit 1
fi
if [[ "$SOURCE_DATABASE_URL" == "$TARGET_DATABASE_URL" ]]; then
  echo "Source and target must be different databases." >&2
  exit 1
fi

export BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-drill-only-passphrase}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP TABLE IF EXISTS backup_drill;
CREATE TABLE backup_drill (id int primary key, note text not null);
INSERT INTO backup_drill (id, note) VALUES (1, 'rcp-drill');
SQL

psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP TABLE IF EXISTS backup_drill;"

DIRECT_URL="$SOURCE_DATABASE_URL" "$ROOT/scripts/backup-postgres.sh" "$WORKDIR/drill.sql.enc"
TARGET_DATABASE_URL="$TARGET_DATABASE_URL" "$ROOT/scripts/restore-postgres.sh" "$WORKDIR/drill.sql.enc" "$TARGET_DATABASE_URL"

NOTE="$(psql "$TARGET_DATABASE_URL" -tAc "SELECT note FROM backup_drill WHERE id = 1;")"
NOTE="$(echo "$NOTE" | tr -d '[:space:]')"
if [[ "$NOTE" != "rcp-drill" ]]; then
  echo "Restore drill failed. Expected rcp-drill, got [$NOTE]." >&2
  exit 1
fi
echo "Restore drill passed."

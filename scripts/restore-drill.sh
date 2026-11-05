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

# Dump and restore with the server's major. A newer pg_dump writes session
# settings the older server does not have, and ON_ERROR_STOP then aborts.
# Ignore DATABASE_URL here. A laptop often has the SQLite demo URL, and the
# nightly job's variable must not steer this drill at a different server.
client_bin="$(
  env -u DATABASE_URL -u DIRECT_URL \
    SOURCE_DATABASE_URL="$SOURCE_DATABASE_URL" \
    bash "$ROOT/scripts/install-matching-pg-client.sh" --print-bin
)"
if [[ -z "$client_bin" || ! -x "$client_bin/pg_dump" || ! -x "$client_bin/psql" ]]; then
  echo "Could not select a Postgres client that matches the source server." >&2
  exit 1
fi
export PATH="$client_bin:$PATH"

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

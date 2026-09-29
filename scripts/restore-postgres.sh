#!/usr/bin/env bash
# Restore an encrypted pg_dump created by scripts/backup-postgres.sh.
# Refuses a Neon host unless CONFIRM_RESTORE=I_UNDERSTAND_THIS_OVERWRITES.
set -euo pipefail

FILE="${1:?Pass the encrypted backup path (.sql.enc)}"
TARGET="${2:-${TARGET_DATABASE_URL:-}}"

if [[ -z "$TARGET" ]]; then
  echo "Pass the scratch database URL as the second argument, or set TARGET_DATABASE_URL." >&2
  exit 1
fi
if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
  echo "Set BACKUP_ENCRYPTION_KEY to the same passphrase used for the backup." >&2
  exit 1
fi
if [[ ! -f "$FILE" ]]; then
  echo "Backup file not found: $FILE" >&2
  exit 1
fi
if [[ "${CONFIRM_RESTORE:-}" != "I_UNDERSTAND_THIS_OVERWRITES" ]]; then
  if [[ "$TARGET" == *"neon.tech"* ]]; then
    echo "Refusing to restore onto Neon." >&2
    echo "Use a scratch database for a drill. To overwrite Neon on purpose, set CONFIRM_RESTORE=I_UNDERSTAND_THIS_OVERWRITES." >&2
    exit 1
  fi
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node "$ROOT/scripts/backup-crypto.mjs" decrypt "$FILE" \
  | psql "$TARGET" -v ON_ERROR_STOP=1
echo "Restore finished."

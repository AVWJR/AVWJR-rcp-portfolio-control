#!/usr/bin/env bash
# Install the pg_dump major version that matches the database server.
# A newer plain dump sets GUCs the older server rejects. Postgres 18 writes
# "SET transaction_timeout = 0", and Postgres 16 then aborts the restore.
#
#   bash scripts/install-matching-pg-client.sh
#   bash scripts/install-matching-pg-client.sh --print-bin
#
# --print-bin writes only the directory that contains the matching pg_dump
# and psql. Other messages go to stderr. The nightly backup reads neither.
set -euo pipefail

PRINT_BIN=0
if [[ "${1:-}" == "--print-bin" ]]; then
  PRINT_BIN=1
fi

log() {
  echo "$@" >&2
}

publish() {
  local dir="$1"
  if [[ ! -x "$dir/pg_dump" || ! -x "$dir/psql" ]]; then
    log "pg_dump and psql were not both found in $dir."
    exit 1
  fi
  if [[ -n "${GITHUB_PATH:-}" ]]; then
    echo "$dir" >> "$GITHUB_PATH"
  fi
  if [[ "$PRINT_BIN" == "1" ]]; then
    printf '%s\n' "$dir"
  fi
  log "Using $("$dir/pg_dump" --version)"
}

URL="${DIRECT_URL:-${DATABASE_URL:-${SOURCE_DATABASE_URL:-}}}"
if [[ -z "$URL" ]]; then
  log "No database URL. Skipping Postgres client install."
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y postgresql-client
fi

raw="$(psql "$URL" -tAc "SHOW server_version_num;" | tr -d '[:space:]')"
if [[ ! "$raw" =~ ^[0-9]+$ ]]; then
  log "Could not read the server version from SHOW server_version_num (got [$raw])."
  exit 1
fi
major=$((raw / 10000))
have="$(pg_dump --version | grep -oE '[0-9]+' | head -1 || true)"
log "Database server is Postgres $major. This machine's pg_dump major is ${have:-missing}."
if [[ "$have" == "$major" ]]; then
  publish "$(dirname "$(command -v pg_dump)")"
  exit 0
fi

# Ubuntu ships the PGDG signing key with postgresql-common, but not the
# apt source. The key file alone does not make postgresql-client-16 installable
# on a release whose own archive only has a newer client.
if [[ ! -f /etc/apt/sources.list.d/pgdg.list ]]; then
  sudo apt-get update
  sudo apt-get install -y curl ca-certificates
  if [[ ! -f /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc ]]; then
    sudo install -d /usr/share/postgresql-common/pgdg
    sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      https://www.postgresql.org/media/keys/ACCC4CF8.asc
  fi
  codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${codename}-pgdg main" \
    | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
  sudo apt-get update
fi

sudo apt-get install -y "postgresql-client-${major}"
bin="/usr/lib/postgresql/${major}/bin"
publish "$bin"

#!/usr/bin/env bash
# Install the pg_dump major version that matches the database server.
# Neon may be Postgres 16 or 17. A dump from an older client can fail or warn.
set -euo pipefail

URL="${DIRECT_URL:-${DATABASE_URL:-${SOURCE_DATABASE_URL:-}}}"
if [[ -z "$URL" ]]; then
  echo "No database URL. Skipping Postgres client install." >&2
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y postgresql-client
fi

raw="$(psql "$URL" -tAc "SHOW server_version_num;" | tr -d '[:space:]')"
if [[ ! "$raw" =~ ^[0-9]+$ ]]; then
  echo "Could not read the server version from SHOW server_version_num (got [$raw])." >&2
  exit 1
fi
major=$((raw / 10000))
have="$(pg_dump --version | grep -oE '[0-9]+' | head -1 || true)"
echo "Database server is Postgres $major. This machine's pg_dump major is ${have:-missing}."
if [[ "$have" == "$major" ]]; then
  exit 0
fi

if [[ ! -f /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc ]]; then
  sudo apt-get update
  sudo apt-get install -y curl ca-certificates
  sudo install -d /usr/share/postgresql-common/pgdg
  sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc
  codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${codename}-pgdg main" \
    | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
  sudo apt-get update
fi

sudo apt-get install -y "postgresql-client-${major}"
bin="/usr/lib/postgresql/${major}/bin"
if [[ ! -x "$bin/pg_dump" ]]; then
  echo "postgresql-client-${major} did not install pg_dump at $bin." >&2
  exit 1
fi
if [[ -n "${GITHUB_PATH:-}" ]]; then
  echo "$bin" >> "$GITHUB_PATH"
fi
export PATH="$bin:$PATH"
echo "Using $(pg_dump --version)"

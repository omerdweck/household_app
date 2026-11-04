#!/usr/bin/env bash
# Spin up a throwaway local PostgreSQL, apply the Supabase stub + all migrations,
# run the SQL tests, then delete everything. Needs PostgreSQL 15+ binaries.
#   ./scripts/test-db.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUN_AS=()

# PostgreSQL refuses to run as root; use an unprivileged user when needed.
if [ "$(id -u)" = "0" ]; then
  id pgtest >/dev/null 2>&1 || useradd -M -s /usr/sbin/nologin pgtest
  chown pgtest "$DATA"
  RUN_AS=(sudo -u pgtest)
fi

cleanup() { "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -w start >/dev/null

PSQL=(psql -h "$DATA" -p "$PORT" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "applying $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
# core first (it creates the fixtures the others reuse), then the rest in name order
TESTS=("$ROOT/supabase/tests/core.test.sql")
for f in "$ROOT"/supabase/tests/*.test.sql; do
  [ "$f" = "$ROOT/supabase/tests/core.test.sql" ] || TESTS+=("$f")
done
for t in "${TESTS[@]}"; do
  echo "running $(basename "$t")"
  "${PSQL[@]}" -f "$t" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
  [ "${PIPESTATUS[0]}" -eq 0 ] || { echo "FAILED: $(basename "$t")"; exit 1; }
done

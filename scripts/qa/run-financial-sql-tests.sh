#!/usr/bin/env bash
# Execute the MYK9-54 financial migrations against a THROWAWAY Postgres cluster.
#
# Why this exists: every other test for these migrations reads them as text
# (readFileSync + toContain). Source pins cannot catch invalid SQL, an ambiguous
# column reference that only fails at CALL time, or a migration that is not
# re-runnable. This runner applies the real migration files twice and then runs
# executable accounting assertions against seeded rows.
#
# NEVER touches a remote/Supabase database — it initdb's its own cluster in a
# temp dir on a non-default port and destroys it on exit (including on failure).
#
# Usage:  pnpm qa:sql:financial       (or: bash scripts/qa/run-financial-sql-tests.sh)
# Exits 0 with a SKIP message if no local Postgres server binaries are installed.

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS="$REPO_ROOT/supabase/migrations"
QA_DIR="$REPO_ROOT/scripts/qa"

FIXTURE="$QA_DIR/financial-reconciliation-local-fixture.sql"
ASSERTIONS="$QA_DIR/financial-reconciliation-local-assertions.sql"
MIGRATION_SNAPSHOTS="$MIGRATIONS/20260717120000_stripe_order_snapshots.sql"
MIGRATION_RPC="$MIGRATIONS/20260717130000_financial_reconciliation_rpc.sql"

# ── Locate Postgres server binaries ────────────────────────────────────────
# initdb/pg_ctl are often absent from PATH even where psql is present (Debian
# keeps them under /usr/lib/postgresql/<major>/bin — that includes the GitHub
# ubuntu runners).
PGBIN=""
if command -v initdb >/dev/null 2>&1 && command -v pg_ctl >/dev/null 2>&1; then
  PGBIN="$(dirname "$(command -v initdb)")"
elif command -v pg_config >/dev/null 2>&1 && [ -x "$(pg_config --bindir)/initdb" ]; then
  PGBIN="$(pg_config --bindir)"
else
  for candidate in /usr/lib/postgresql/*/bin /usr/local/opt/postgresql*/bin /opt/homebrew/opt/postgresql*/bin; do
    if [ -x "$candidate/initdb" ] && [ -x "$candidate/pg_ctl" ]; then
      PGBIN="$candidate"
      break
    fi
  done
fi

if [ -z "$PGBIN" ]; then
  # In CI the binaries are guaranteed present, so a skip would be a silent green.
  # MYK9_SQL_TEST_REQUIRE=1 turns the skip into a hard failure.
  if [ "${MYK9_SQL_TEST_REQUIRE:-0}" = "1" ]; then
    echo "FAIL: MYK9_SQL_TEST_REQUIRE=1 but no initdb/pg_ctl found — the financial"
    echo "      SQL tests would have been silently skipped."
    exit 1
  fi
  echo "SKIP: no local Postgres server binaries (initdb/pg_ctl) found."
  echo "      Install Postgres to run the financial SQL tests, e.g.:"
  echo "        macOS:  brew install postgresql@16"
  echo "        Debian: sudo apt-get install postgresql"
  exit 0
fi

echo "Using Postgres binaries from: $PGBIN"
"$PGBIN/initdb" --version

# ── Throwaway cluster ──────────────────────────────────────────────────────
PGPORT="${MYK9_SQL_TEST_PORT:-54329}"
PGDATA="$(mktemp -d "${TMPDIR:-/tmp}/myk9-sqltest.XXXXXX")/data"
# The unix socket dir must be SHORT: sun_path caps at ~103 bytes and a mktemp
# path under macOS $TMPDIR blows past that once the socket name is appended.
PGSOCKET="$(mktemp -d /tmp/myk9pg.XXXXXX)"
DB_NAME="myk9_financial_test"
STARTED=0

cleanup() {
  local status=$?
  if [ "$STARTED" -eq 1 ]; then
    "$PGBIN/pg_ctl" -D "$PGDATA" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$(dirname "$PGDATA")" "$PGSOCKET"
  if [ "$status" -ne 0 ]; then
    echo ""
    echo "FINANCIAL SQL TESTS FAILED (exit $status)"
  fi
  exit "$status"
}
trap cleanup EXIT

# LC_ALL=C: without it initdb probes locales via a threaded path and Postgres
# aborts with "postmaster became multithreaded during startup" on macOS.
export LC_ALL=C
export PGHOST="$PGSOCKET"
export PGPORT

echo "Initializing throwaway cluster at $PGDATA (port $PGPORT)"
"$PGBIN/initdb" -D "$PGDATA" -U postgres --no-locale --encoding=UTF8 >/dev/null

"$PGBIN/pg_ctl" -D "$PGDATA" -w -o "-p $PGPORT -k $PGSOCKET -c listen_addresses=''" -l "$PGDATA/server.log" start
STARTED=1

PSQL=("$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -U postgres)

"${PSQL[@]}" -d postgres -c "CREATE DATABASE $DB_NAME" >/dev/null
RUN=("${PSQL[@]}" -d "$DB_NAME")

echo ""
echo "── Fixture: roles, real-shaped tables, toggleable authz stubs ──"
"${RUN[@]}" -f "$FIXTURE"

# ── Apply the REAL migrations, twice, asserting re-runnability ─────────────
# A CREATE OR REPLACE FUNCTION cannot change an existing RETURNS TABLE
# signature, so a missing DROP wedges the second apply. That is exactly the
# class of bug this second pass exists to catch.
for pass in 1 2; do
  echo ""
  echo "── Applying migrations (pass $pass/2 — re-runnability) ──"
  "${RUN[@]}" -f "$MIGRATION_SNAPSHOTS"
  "${RUN[@]}" -f "$MIGRATION_RPC"
  echo "   pass $pass applied cleanly"
done

echo ""
echo "── Executable assertions ──"
"${RUN[@]}" -f "$ASSERTIONS"

echo ""
echo "FINANCIAL SQL TESTS PASSED"

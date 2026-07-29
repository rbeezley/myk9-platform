#!/usr/bin/env bash
# Run every committed behavioral SQL contract against a local migrated Supabase
# database. The loopback guard makes it impossible to point this harness at a
# shared staging or production database.

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_DIR="$REPO_ROOT/supabase/tests"
DATABASE_URL="${MYK9_BEHAVIORAL_SQL_DATABASE_URL:-}"

if [ -z "$DATABASE_URL" ]; then
  echo "FAIL: MYK9_BEHAVIORAL_SQL_DATABASE_URL is required." >&2
  exit 1
fi

LOCAL_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
if [ "$DATABASE_URL" != "$LOCAL_DATABASE_URL" ]; then
  echo "FAIL: behavioral SQL tests require the exact local loopback database URL." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "FAIL: psql is required for behavioral SQL tests." >&2
  exit 1
fi

TEST_FILES=("$TEST_DIR"/*.sql)
if [ ! -e "${TEST_FILES[0]}" ]; then
  echo "FAIL: no behavioral SQL tests found in $TEST_DIR." >&2
  exit 1
fi

for test_file in "${TEST_FILES[@]}"; do
  echo "── $(basename "$test_file") ──"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$test_file"
done

echo "BEHAVIORAL SQL TESTS PASSED (${#TEST_FILES[@]} files)"

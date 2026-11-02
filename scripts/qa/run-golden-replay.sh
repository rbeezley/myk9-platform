#!/usr/bin/env bash
# MYK9-1647 golden replay: rebuild the generated SQL from the committed fixture
# and run it against a local Supabase database. Exits non-zero on any diff.
#
#   pnpm qa:golden-replay
#
# With MYK9_BEHAVIORAL_SQL_DATABASE_URL set (loopback only, same guard as
# run-behavioral-sql-tests.sh) it uses that database; otherwise it starts its
# own throwaway native stack `golden-replay` and destroys it on exit.
# Self-check: after the replay it replays a copy of the fixture with two
# untied places swapped and requires THAT to fail, so a replay that cannot go
# red is itself a failure. CI runs the same SQL file in the behavioral SQL job;
# the fixture, rules and source live in supabase/tests/fixtures/golden-replay/.

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
SUPABASE="${SUPABASE_BIN:-supabase}"
STACK="golden-replay"
export SUPABASE_EXPERIMENTAL_STACK=1
SQL_FILE="supabase/tests/golden_replay_trial_27835_test.sql"
SCRATCH="$(mktemp -d)"
stack_started=0

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  rm -rf "$SCRATCH"
  if [ "$stack_started" = "1" ]; then
    "$SUPABASE" stack destroy --workdir "$REPO_ROOT" --stack "$STACK" --yes >/dev/null 2>&1 ||
      { echo "FAIL: stack destroy failed; see '$SUPABASE stack list'." >&2; [ "$status" = "0" ] && status=1; }
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

pnpm exec tsx scripts/qa/golden-replay/build.ts

URL="${MYK9_BEHAVIORAL_SQL_DATABASE_URL:-}"
LOOPBACK_URL_RE='^postgresql://postgres:postgres@(127\.0\.0\.1|localhost):([0-9]{1,5})/postgres$'
if [ -z "$URL" ]; then
  "$SUPABASE" stack destroy --workdir "$REPO_ROOT" --stack "$STACK" --yes >/dev/null 2>&1 || true
  slot=$(($(printf '%s' "$REPO_ROOT" | cksum | cut -d' ' -f1) % 1000))
  export SUPABASE_API_PORT=$((42000 + 2 * slot)) SUPABASE_DB_PORT=$((42001 + 2 * slot))
  stack_started=1
  echo "==> Starting a throwaway native stack (db port $SUPABASE_DB_PORT)"
  "$SUPABASE" start --workdir "$REPO_ROOT" --stack "$STACK" --runtime native \
    --exclude functions,studio,mail,analytics,pooler
  URL="postgresql://postgres:postgres@127.0.0.1:$SUPABASE_DB_PORT/postgres"
elif ! [[ "$URL" =~ $LOOPBACK_URL_RE ]]; then
  echo "FAIL: the golden replay only runs against a local loopback database." >&2
  exit 1
fi

echo "==> Replaying the real trial through recalculate_class_placements"
psql "$URL" -X -v ON_ERROR_STOP=1 -f "$SQL_FILE"

echo "==> Self-check: a fixture with two swapped placements must fail"
pnpm exec tsx scripts/qa/golden-replay/build.ts --swapped-out "$SCRATCH/swapped.sql"
if psql "$URL" -X -v ON_ERROR_STOP=1 -f "$SCRATCH/swapped.sql" >"$SCRATCH/swapped.log" 2>&1; then
  echo "FAIL: the swapped-placement fixture replayed green; the golden replay cannot go red." >&2
  exit 1
fi
if ! grep -q "GOLDEN_REPLAY_DIFF" "$SCRATCH/swapped.log"; then
  echo "FAIL: the swapped fixture failed for the wrong reason:" >&2
  cat "$SCRATCH/swapped.log" >&2
  exit 1
fi
echo "PASS: golden replay matched v3, and the swapped-placement self-check went red as required."

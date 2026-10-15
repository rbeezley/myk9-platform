#!/usr/bin/env bash
# Optional pre-push check for migration changes: rebuild the whole schema from
# supabase/migrations/ on a throwaway Docker-free ("native") Supabase stack and
# run the same SQL steps as CI's `sql-tests` job. CI stays the authoritative
# gate; this only lets you see its verdict before pushing.
#
# Usage:  pnpm qa:sql-local
#         SUPABASE_BIN=/path/to/supabase pnpm qa:sql-local   (CLI not on PATH)
#
# NEVER touches the linked project: no `db push`, no `--linked`. Every step
# targets the local stack, the test runners refuse any database URL other than
# 127.0.0.1:54322, and the stack is destroyed on success, failure or Ctrl-C.
# The run owns a dedicated stack named `qa-sql-local`, never the worktree's
# default stack, so a development stack you started yourself is left alone.
#
# Native runtime: macOS 14+ Apple silicon or Linux glibc 2.35+, CLI >= 2.121.0
# (earlier versions fail native pg_cron jobs on macOS). Findings behind it:
# docs/archive/plan-supabase-native-local-dev.md.

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUPABASE="${SUPABASE_BIN:-supabase}"
MIN_VERSION="2.121.0"
STACK="qa-sql-local"
# The test runners accept only this exact URL, so the stack must use the
# config.toml ports; clear any per-shell override.
LOCAL_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
unset SUPABASE_DB_PORT SUPABASE_API_PORT
export SUPABASE_EXPERIMENTAL_STACK=1

if ! command -v "$SUPABASE" >/dev/null 2>&1; then
  echo "FAIL: Supabase CLI not found ('$SUPABASE'). Install >= $MIN_VERSION, or set SUPABASE_BIN." >&2
  exit 1
fi

version="$("$SUPABASE" --version 2>/dev/null | head -n 1 | tr -d '[:space:]')"
version="${version#v}"
lowest="$(printf '%s\n%s\n' "$MIN_VERSION" "$version" | sort -V | head -n 1)"
if [ -z "$version" ] || [ "$lowest" != "$MIN_VERSION" ]; then
  echo "FAIL: Supabase CLI ${version:-unknown} is too old; the native runtime needs >= $MIN_VERSION." >&2
  echo "      Upgrade with 'brew upgrade supabase' once Homebrew has it, or download the" >&2
  echo "      release from https://github.com/supabase/cli/releases and set SUPABASE_BIN." >&2
  exit 1
fi

cd "$REPO_ROOT"

# Succeeds when the stack is gone afterwards: destroyed now, or confirmed absent.
# Any other error fails, so a surviving stack is never resumed or leaked.
destroy_stack() {
  local output
  output="$("$SUPABASE" stack destroy --workdir "$REPO_ROOT" --stack "$STACK" --yes 2>&1)" && return 0
  [[ "$output" == *"No managed stack named \"$STACK\""* ]] && return 0
  echo "$output" >&2
  return 1
}

stack_started=0
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [ "$stack_started" = "1" ]; then
    echo "==> Destroying the local stack"
    # A leaked stack keeps port 54322 and blocks the next run, so a failed
    # teardown fails the run even when every test passed.
    if ! destroy_stack; then
      echo "FAIL: stack destroy failed; find it with 'SUPABASE_EXPERIMENTAL_STACK=1 $SUPABASE stack list'." >&2
      [ "$status" = "0" ] && status=1
    fi
  fi
  if [ "$status" = "0" ]; then
    echo "PASS: local SQL checks green (CI's sql-tests job is still the gate)."
  else
    echo "FAIL: local SQL checks failed (exit $status)." >&2
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# A `qa-sql-local` stack left by a killed run would be resumed, not rebuilt.
if ! destroy_stack; then
  echo "FAIL: could not remove a leftover '$STACK' stack; it would be resumed instead of rebuilt." >&2
  exit 1
fi

# The steps below mirror .github/workflows/ci.yml `sql-tests`; keep them in step.
# A new stack applies every migration on start, and the repo has no seed.sql,
# so this is CI's `start` + `db reset --no-seed`. (`db reset` has no --stack
# flag, so it is not used here.)
if [ -e supabase/seed.sql ] || grep -q '^sql_paths' supabase/config.toml; then
  echo "FAIL: a seed is now configured, which 'start' would apply; CI runs with --no-seed." >&2
  exit 1
fi
echo "==> Starting a fresh native stack and applying all migrations (CLI $version)"
# Set before `start`: a half-started stack still holds the port.
stack_started=1
"$SUPABASE" start --workdir "$REPO_ROOT" --stack "$STACK" --runtime native \
  --exclude functions,studio,mail,analytics,pooler

export MYK9_BEHAVIORAL_SQL_DATABASE_URL="$LOCAL_DATABASE_URL"

echo "==> Behavioral RLS and RPC SQL tests"
bash scripts/qa/run-behavioral-sql-tests.sh

echo "==> Lifecycle absent installed SQL mutation proof"
node --experimental-strip-types scripts/qa/class-absent-mutation.ts

echo "==> Financial migration SQL tests"
MYK9_SQL_TEST_REQUIRE=1 bash scripts/qa/run-financial-sql-tests.sh

#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bash scripts/qa/run-nightly-isolated.sh [--date YYYY-MM-DD] [--port PORT]

Prepares a detached QA worktree from origin/main and writes .qa-nightly.env
inside it. Run the Nightly commands from that worktree with the generated
PLAYWRIGHT_* values so local WIP in the primary checkout cannot contaminate
the trusted baseline.
USAGE
}

run_date="$(date +%F)"
port="${QA_NIGHTLY_PORT:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --date)
      run_date="${2:?missing value for --date}"
      shift 2
      ;;
    --port)
      port="${2:?missing value for --port}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

repo_root="$(git rev-parse --show-toplevel)"
timestamp="$(date +%H%M%S)"
worktree="${QA_NIGHTLY_WORKTREE:-"$repo_root/.worktrees/nightly-qa-$run_date-$timestamp"}"
worktree_created=0

cleanup_prepare_failure() {
  local status="$?"

  if [[ "$status" -ne 0 && "$worktree_created" -eq 1 ]]; then
    bash "$repo_root/scripts/qa/cleanup-nightly-isolated.sh" "$worktree" || true
  fi
  exit "$status"
}

trap cleanup_prepare_failure EXIT

if [[ -z "$port" ]]; then
  port=$((5700 + RANDOM % 1000))
fi

if [[ -e "$worktree" ]]; then
  echo "Refusing to reuse existing path: $worktree" >&2
  exit 1
fi

cd "$repo_root"
git fetch origin
baseline_sha="$(git rev-parse origin/main)"
git worktree add --detach "$worktree" origin/main
worktree_created=1

env_file="$worktree/.qa-nightly.env"
{
  printf 'export QA_NIGHTLY_DATE=%q\n' "$run_date"
  printf 'export QA_NIGHTLY_BASELINE_SHA=%q\n' "$baseline_sha"
  printf 'export QA_NIGHTLY_WORKTREE=%q\n' "$worktree"
  printf 'export PLAYWRIGHT_PORT=%q\n' "$port"
  printf 'export PLAYWRIGHT_BASE_URL=%q\n' "http://127.0.0.1:$port"
  printf 'export PLAYWRIGHT_HMR_PORT=%q\n' "$((port + 20000))"
  printf 'export QA_NIGHTLY_GLOBAL_TIMEOUT_SECONDS=%q\n' "1800"
} > "$env_file"

trap - EXIT

cat <<SUMMARY
Prepared isolated Nightly QA worktree.

Worktree: $worktree
Baseline: origin/main $baseline_sha
Env file: $env_file

Use these values for Playwright commands:
  PLAYWRIGHT_PORT=$port
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:$port
  PLAYWRIGHT_HMR_PORT=$((port + 20000))

The standard health flow cleans up this worktree automatically:
  pnpm qa:nightly:run

For a manual multi-phase run, remove this worktree when finished:
  bash "$repo_root/scripts/qa/cleanup-nightly-isolated.sh" "$worktree"
SUMMARY

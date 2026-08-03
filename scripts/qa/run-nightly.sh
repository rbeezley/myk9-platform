#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bash scripts/qa/run-nightly.sh [--date YYYY-MM-DD] [--port PORT]

Runs the scheduled Nightly Health checks in an isolated worktree and always
removes that worktree when the checks finish.
USAGE
}

repo_root="$(git rev-parse --show-toplevel)"
run_date="$(printenv QA_NIGHTLY_DATE || true)"
port="$(printenv QA_NIGHTLY_PORT || true)"

if [[ -z "$run_date" ]]; then
  run_date="$(date +%F)"
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --date)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --date" >&2
        exit 2
      fi
      run_date="$2"
      shift 2
      ;;
    --port)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --port" >&2
        exit 2
      fi
      port="$2"
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

timestamp="$(date +%H%M%S)"
worktree="$(printenv QA_NIGHTLY_WORKTREE || true)"
if [[ -z "$worktree" ]]; then
  worktree="$repo_root/.worktrees/nightly-qa-$run_date-$timestamp"
fi

if [[ -n "$port" ]]; then
  QA_NIGHTLY_WORKTREE="$worktree" bash "$repo_root/scripts/qa/run-nightly-isolated.sh" \
    --date "$run_date" --port "$port"
else
  QA_NIGHTLY_WORKTREE="$worktree" bash "$repo_root/scripts/qa/run-nightly-isolated.sh" \
    --date "$run_date"
fi

env_file="$worktree/.qa-nightly.env"
cleanup_script="$repo_root/scripts/qa/cleanup-nightly-isolated.sh"

cleanup() {
  local run_status="$?"
  local cleanup_status=0
  local report_branch

  report_branch="$(printenv QA_NIGHTLY_REPORT_BRANCH || true)"
  set +e
  bash "$cleanup_script" "$worktree" "$report_branch" || cleanup_status="$?"
  set -e

  if [[ "$run_status" -ne 0 ]]; then
    exit "$run_status"
  fi
  exit "$cleanup_status"
}

trap cleanup EXIT

(
  cd "$worktree"
  source "$env_file"
  bash scripts/qa/run-nightly-health.sh
)

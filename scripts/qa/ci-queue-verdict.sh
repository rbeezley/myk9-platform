#!/usr/bin/env bash
# Decides whether a `main` push run of CI may skip its jobs because the merge
# queue already tested this exact commit (MYK9-2239, docs/plan-merge-queue.md).
#
# With a merge queue, a PR is tested on top of the current `main` in a
# `merge_group` CI run before it lands. Testing the same commit again on the
# `main` push is the double run MYK9-2239 removes. The `main` push run still
# exists, because direct-to-main commits need a verdict and the deploy picker
# (scripts/qa/pick-deploy-commit.sh) reads `main` push runs; this script only
# decides whether its jobs have anything left to prove.
#
# Prints `tested=true` ONLY when a `merge_group` CI run for exactly this SHA
# concluded `success`. Everything else prints `tested=false`, so the full suite
# runs: no queue run, a failed or cancelled one, one still running after the
# wait, a malformed SHA, or a GitHub query that fails. A wrong answer here must
# cost runner time, never a false green on `main`.
#
#   SHA            the pushed commit (github.sha); required
#   REPO           owner/name (github.repository); required
#   WAIT_SECONDS   how long to wait for an in-progress queue run (default 1800)
#   POLL_SECONDS   seconds between polls (default 30)
#
# Writes `tested=<bool>` to $GITHUB_OUTPUT when set; always logs to stdout.
# Exits 0 in every case: the answer is the output, not the exit status.
set -uo pipefail

sha="${SHA:-}"
repo="${REPO:-}"
wait_seconds="${WAIT_SECONDS:-1800}"
poll_seconds="${POLL_SECONDS:-30}"

answer() {
  echo "queue-verdict: tested=$1 ($2)"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "tested=$1" >>"$GITHUB_OUTPUT"
  fi
  exit 0
}

[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || answer false "SHA '$sha' is not a full 40-character commit SHA"
[[ -n "$repo" ]] || answer false "REPO is not set"

deadline=$((SECONDS + wait_seconds))
while :; do
  if ! run="$(gh run list --repo "$repo" --workflow CI --event merge_group --commit "$sha" --limit 1 \
    --json databaseId,status,conclusion --jq '.[0] // empty | "\(.databaseId) \(.status) \(.conclusion)"')"; then
    answer false "GitHub query for merge-queue runs on $sha failed; running the full suite"
  fi
  [[ -n "$run" ]] || answer false "no merge-queue CI run for $sha (a direct push, or the queue is off)"

  read -r run_id status conclusion <<<"$run"
  if [[ "$status" == "completed" ]]; then
    [[ "$conclusion" == "success" ]] && answer true "merge-queue run $run_id concluded success on $sha"
    answer false "merge-queue run $run_id concluded '$conclusion' on $sha"
  fi
  if ((SECONDS >= deadline)); then
    answer false "merge-queue run $run_id still '$status' after ${wait_seconds}s"
  fi
  echo "queue-verdict: merge-queue run $run_id is '$status'; checking again in ${poll_seconds}s"
  sleep "$poll_seconds"
done

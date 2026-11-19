#!/usr/bin/env bash
# Waits for a PR handed to the merge queue to land, or to leave the queue
# without landing (MYK9-2239, docs/plan-merge-queue.md).
#
# With a merge queue, `gh pr merge <n> --squash` returns as soon as the PR
# JOINS the queue; the merge happens after the queue's own CI run, minutes
# later. `gh pr view --json state` then says OPEN both while the PR waits and
# after the queue dropped it, so it cannot answer "did it merge?". This asks
# GitHub whether the PR is still in the queue as well as whether it merged.
#
#   wait-pr-merged.sh <pr-number>
#
#   REPO             owner/name (default: the current checkout's repository)
#   TIMEOUT_SECONDS  default 5400 (the queue's 60-minute check timeout, plus slack)
#   POLL_SECONDS     default 30
#   GRACE_POLLS      default 2: consecutive "open, not queued, no auto-merge"
#                    reads before calling it dropped, so the moment between
#                    leaving the queue and the merge registering is not a verdict
#
# Exit codes:
#   0  merged; prints `merged <merge commit SHA>`
#   1  closed, or left the queue without merging (CI failed in the queue, a
#      conflict, a timeout, or someone removed it); read the PR's timeline
#   3  timed out, or GitHub could not be read: NOT a verdict, run it again
set -uo pipefail

pr="${1:-}"
[[ "$pr" =~ ^[0-9]+$ ]] || {
  echo "usage: wait-pr-merged.sh <pr-number>" >&2
  exit 3
}
repo="${REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)}"
[[ "$repo" == */* ]] || {
  echo "wait-pr-merged: could not tell which repository; set REPO=owner/name" >&2
  exit 3
}
timeout_seconds="${TIMEOUT_SECONDS:-5400}"
poll_seconds="${POLL_SECONDS:-30}"
grace_polls="${GRACE_POLLS:-2}"

query='query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      state
      isInMergeQueue
      mergeCommit { oid }
      autoMergeRequest { enabledAt }
    }
  }
}'

deadline=$((SECONDS + timeout_seconds))
unqueued=0
read_errors=0
while :; do
  if row="$(gh api graphql -f query="$query" -f owner="${repo%%/*}" -f name="${repo#*/}" -F number="$pr" \
    --jq '.data.repository.pullRequest | "\(.state) \(.isInMergeQueue) \(.mergeCommit.oid // "-") \(.autoMergeRequest != null)"')" &&
    [[ -n "$row" ]]; then
    read_errors=0
    read -r state queued merge_sha auto_merge <<<"$row"
    case "$state" in
      MERGED)
        echo "merged $merge_sha"
        exit 0
        ;;
      CLOSED)
        echo "wait-pr-merged: PR #$pr was closed without merging" >&2
        exit 1
        ;;
    esac
    if [[ "$queued" == "true" || "$auto_merge" == "true" ]]; then
      unqueued=0
      echo "wait-pr-merged: PR #$pr is $([[ "$queued" == "true" ]] && echo "in the merge queue" || echo "waiting on auto-merge")"
    else
      unqueued=$((unqueued + 1))
      if ((unqueued >= grace_polls)); then
        echo "wait-pr-merged: PR #$pr is open and no longer in the merge queue; it left without merging" >&2
        exit 1
      fi
    fi
  else
    read_errors=$((read_errors + 1))
    echo "wait-pr-merged: could not read PR #$pr (attempt $read_errors)" >&2
    if ((read_errors >= 5)); then
      echo "wait-pr-merged: GitHub unreadable; NOT a verdict" >&2
      exit 3
    fi
  fi
  if ((SECONDS >= deadline)); then
    echo "wait-pr-merged: still waiting after ${timeout_seconds}s; NOT a verdict" >&2
    exit 3
  fi
  sleep "$poll_seconds"
done

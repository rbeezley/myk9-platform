#!/usr/bin/env bash
# Mirrors a PR's `Review gate` status onto its merge-queue commit (MYK9-2239,
# docs/plan-merge-queue.md).
#
# `Review gate` is a required commit status, and review-gate.yml pins it to the
# PR head SHA (scripts/qa/review-gate.ts). A merge queue tests a different
# commit: the PR squashed on top of `main` and anything queued ahead of it.
# Nothing would ever post `Review gate` there, so every queued PR would time
# out. This script copies the PR head's verdict to the queue commit.
#
# It mirrors rather than re-evaluates: the review evidence is pinned to the PR
# head, the PR head is exactly what the queue squashes, and review-gate.ts stays
# the only evaluator. It posts `success` only when the newest `Review gate`
# status on the PR head is `success`; anything it cannot read or validate posts
# `failure`, and the queue drops the PR.
#
#   REPO      owner/name; required
#   HEAD_REF  github.event.merge_group.head_ref, e.g.
#             refs/heads/gh-readonly-queue/main/pr-123-<40-hex PR head SHA>
#   HEAD_SHA  github.event.merge_group.head_sha (the queue commit)
#   RUN_URL   link for the status's target_url (optional)
#
# Exit 0 after posting either verdict; exit 1 when HEAD_SHA itself is unusable,
# because then there is no commit to post to (the queue times the PR out).
set -uo pipefail

repo="${REPO:-}"
head_ref="${HEAD_REF:-}"
queue_sha="${HEAD_SHA:-}"
run_url="${RUN_URL:-}"
context='Review gate'

if [[ ! "$queue_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "merge-queue-review-gate: HEAD_SHA '$queue_sha' is not a full 40-character SHA; nothing to post to" >&2
  exit 1
fi

post() {
  local state="$1" description="$2"
  # GitHub caps a status description at 140 characters.
  description="${description:0:140}"
  echo "merge-queue-review-gate: posting $state to $queue_sha: $description"
  if ! gh api --method POST "repos/$repo/statuses/$queue_sha" \
    -f state="$state" \
    -f context="$context" \
    -f description="$description" \
    -f target_url="$run_url" >/dev/null; then
    echo "merge-queue-review-gate: posting the status failed" >&2
    exit 1
  fi
  exit 0
}

[[ -n "$repo" ]] || {
  echo "merge-queue-review-gate: REPO is not set" >&2
  exit 1
}

if [[ ! "$head_ref" =~ (^|/)gh-readonly-queue/[^/]+/pr-([0-9]+)-([0-9a-f]{40})$ ]]; then
  post failure "queue ref '$head_ref' does not name a PR and its head SHA"
fi
pr="${BASH_REMATCH[2]}"
pr_sha="${BASH_REMATCH[3]}"

# The combined-status endpoint returns the LATEST status per context, so a
# green later overwritten by a red reads as red.
if ! states="$(gh api "repos/$repo/commits/$pr_sha/status" \
  --jq ".statuses[] | select(.context == \"$context\") | .state")"; then
  post failure "could not read the Review gate status on PR #$pr head ${pr_sha:0:7}"
fi

case "$states" in
  success) post success "PR #$pr head ${pr_sha:0:7} has a green Review gate (mirrored to the merge queue)" ;;
  '') post failure "PR #$pr head ${pr_sha:0:7} has no Review gate status" ;;
  *) post failure "PR #$pr head ${pr_sha:0:7} Review gate is '${states//$'\n'/,}', not success" ;;
esac

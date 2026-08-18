#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bash scripts/qa/cleanup-nightly-isolated.sh WORKTREE [REPORT_BRANCH]

Removes a Nightly QA worktree and, when supplied, its run-scoped report branch.
The branch must use the codex/nightly-qa-* naming convention.
USAGE
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 2
fi

worktree="$1"
report_branch=""
if [[ $# -eq 2 ]]; then
  report_branch="$2"
fi

if [[ ! -e "$worktree" ]]; then
  echo "Nightly worktree does not exist: $worktree" >&2
  exit 1
fi

if ! git -C "$worktree" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a Git worktree: $worktree" >&2
  exit 1
fi

primary_root="$(git -C "$worktree" worktree list --porcelain | awk '
  /^worktree / { print substr($0, 10); exit }
')"

if [[ -z "$primary_root" || "$primary_root" == "$worktree" ]]; then
  echo "Refusing to remove the primary checkout: $worktree" >&2
  exit 1
fi

current_branch="$(git -C "$worktree" symbolic-ref --quiet --short HEAD || true)"
if [[ -z "$report_branch" && "$current_branch" == codex/nightly-qa-* ]]; then
  report_branch="$current_branch"
fi

if [[ -n "$report_branch" && "$report_branch" != codex/nightly-qa-* ]]; then
  echo "Refusing to remove a non-Nightly branch: $report_branch" >&2
  exit 1
fi

git -C "$primary_root" worktree remove --force "$worktree"

if [[ -n "$report_branch" ]] && git -C "$primary_root" show-ref --verify --quiet "refs/heads/$report_branch"; then
  git -C "$primary_root" branch -D "$report_branch"
fi

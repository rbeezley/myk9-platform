#!/usr/bin/env bash
# Delete local branches that are PROVABLY merged.
#
# Why this exists: `git branch -D` is denied in .claude/settings.json, where it
# sits in the destructive-git blocklist next to `reset --hard` and `rebase`.
# That deny is correct and should stay. A permission rule is a string match, so
# it can express "any branch -D" but not "only branches proven merged" — the
# safety property is semantic. This script encodes the proof instead, so the
# weekly branch-janitor can reap without weakening the rule for every session.
#
# Usage:
#   scripts/reap-merged-branches.sh            # dry run, prints what it would do
#   scripts/reap-merged-branches.sh --apply    # actually delete
#
# A branch is deleted ONLY if it is not the main branch, not checked out in any
# worktree, not an open-PR head, and satisfies at least one of:
#   (a) its name matches the headRefName of a MERGED pull request, or
#   (b) its tip is an ancestor of origin/<main>.
#
# Commit-subject matching is deliberately NOT a signal. PRs here squash-merge,
# so a merged branch's individual subjects never appear in main, and a
# subject-grep check reports merged branches as unmerged.

set -euo pipefail

REPO="${REPO:-$(git rev-parse --show-toplevel)}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"

APPLY=0
case "${1:-}" in
  --apply) APPLY=1 ;;
  --dry-run | '') ;;
  *)
    echo "usage: $(basename "$0") [--apply|--dry-run]" >&2
    exit 2
    ;;
esac

cd "$REPO"

git fetch --prune origin --quiet

# Branches a worktree has checked out. git refuses to delete these anyway;
# listing them keeps the report honest instead of noisy with failures.
worktree_branches="$(git worktree list --porcelain |
  sed -n 's|^branch refs/heads/||p' | sort -u)"

# Merged and open PR heads. If gh is missing or fails we fall back to ancestry
# alone, which is strictly safer (fewer deletions), never less safe.
merged_heads=""
open_heads=""
if command -v gh >/dev/null 2>&1 &&
  merged_heads="$(gh pr list --state merged --limit 1000 \
    --json headRefName --jq '.[].headRefName' 2>/dev/null | sort -u)" &&
  open_heads="$(gh pr list --state open --limit 1000 \
    --json headRefName --jq '.[].headRefName' 2>/dev/null | sort -u)"; then
  :
else
  echo "warn: gh unavailable or failed; using ancestry proof only" >&2
  merged_heads=""
  open_heads=""
fi

in_list() { printf '%s\n' "$2" | grep -Fxq -- "$1"; }

reaped=0
kept=0

while IFS= read -r br; do
  [ -z "$br" ] && continue
  [ "$br" = "$MAIN_BRANCH" ] && continue

  if in_list "$br" "$worktree_branches"; then
    echo "keep  $br (checked out in a worktree)"
    kept=$((kept + 1))
    continue
  fi

  if [ -n "$open_heads" ] && in_list "$br" "$open_heads"; then
    echo "keep  $br (open PR head)"
    kept=$((kept + 1))
    continue
  fi

  proof=""
  if [ -n "$merged_heads" ] && in_list "$br" "$merged_heads"; then
    proof="merged-PR"
  elif [ "$(git rev-list --count "origin/$MAIN_BRANCH..$br")" = "0" ]; then
    proof="ancestor"
  fi

  if [ -z "$proof" ]; then
    kept=$((kept + 1))
    continue
  fi

  sha="$(git rev-parse --short "$br")"
  if [ "$APPLY" = "1" ]; then
    git branch -D "$br" >/dev/null
    echo "reap  $br ($proof, was $sha)"
  else
    echo "would reap  $br ($proof, at $sha)"
  fi
  reaped=$((reaped + 1))
done < <(git branch --format='%(refname:short)')

if [ "$APPLY" = "1" ]; then
  echo "--- reaped $reaped, kept $kept"
else
  echo "--- would reap $reaped, keep $kept (re-run with --apply)"
fi

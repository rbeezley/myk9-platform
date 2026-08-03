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
# A branch is deleted ONLY if it is not protected, not checked out in any
# worktree, not an open-PR head, and satisfies at least one of:
#   (a) a MERGED PR used this branch as its head AND the local tip still equals
#       that PR's headRefOid, or
#   (b) its tip is an ancestor of origin/<main>.
#
# Proof (a) compares SHAs, not names. Branch names here are template-generated
# (claude/vacation-myk9-<n>-a1, codex/nightly-qa-<date>) and humans re-create
# branches after a merge, so a name-only match would call a reused name
# "merged" while its tip carried new commits — deleting unmerged work while
# reporting proof. The tip check is what makes the signal trustworthy, and
# querying per-branch also avoids a global --limit ceiling silently hiding
# older merged PRs.
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

# Never delete these, whatever the proofs say. staging-release and
# guides-release are protected deployment refs that Vercel branch-tracking
# follows (docs/operations/ci-vercel-deploys.md); they point at an older
# validated SHA on purpose, so they always satisfy the ancestor proof.
#
# This list is NOT configurable. EXTRA_PROTECTED_BRANCHES only ever adds:
# an override that could drop an entry would let a caller expose main to the
# ancestor proof, and "delete main" must not be reachable through config.
#
# Literal "main" is listed separately from $MAIN_BRANCH, which is only the
# ancestry target. Otherwise MAIN_BRANCH=release would protect release and
# leave main deletable the moment it is an ancestor of origin/release.
PROTECTED_BRANCHES="main
$MAIN_BRANCH
staging-release
guides-release${EXTRA_PROTECTED_BRANCHES:+
$EXTRA_PROTECTED_BRANCHES}"

# Branches a worktree has checked out. git refuses to delete these anyway;
# listing them keeps the report honest instead of noisy with failures.
worktree_branches="$(git worktree list --porcelain |
  sed -n 's|^branch refs/heads/||p' | sort -u)"

# gh is queried per branch below, so there is no global --limit to outgrow.
# Without gh we fall back to ancestry alone, which deletes strictly less.
HAVE_GH=0
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  HAVE_GH=1
else
  echo "warn: gh unavailable; using ancestry proof only" >&2
fi

in_list() { printf '%s\n' "$2" | grep -Fxq -- "$1"; }

reaped=0
kept=0

while IFS= read -r br; do
  [ -z "$br" ] && continue

  if in_list "$br" "$PROTECTED_BRANCHES"; then
    echo "keep  $br (protected branch)"
    kept=$((kept + 1))
    continue
  fi

  if in_list "$br" "$worktree_branches"; then
    echo "keep  $br (checked out in a worktree)"
    kept=$((kept + 1))
    continue
  fi

  # The branch list is enumerated once, but each iteration re-reads git. A
  # concurrent agent reaping a branch mid-run would otherwise abort the whole
  # pass under `set -e`, leaving it half-done and without a summary.
  if ! tip="$(git rev-parse --verify --quiet "$br^{commit}")"; then
    echo "keep  $br (vanished mid-run)"
    kept=$((kept + 1))
    continue
  fi
  proof=""

  if [ "$HAVE_GH" = "1" ]; then
    # One lookup per branch: every PR that ever used this name as its head.
    # Formatted through gh's own --jq so a missing standalone jq cannot make
    # the proof silently unsatisfiable.
    prs="$(gh pr list --head "$br" --state all --limit 100 \
      --json state,headRefOid --jq '.[] | "\(.state) \(.headRefOid)"' \
      2>/dev/null || echo '')"

    if printf '%s\n' "$prs" | grep -q '^OPEN '; then
      echo "keep  $br (open PR head)"
      kept=$((kept + 1))
      continue
    fi

    # Merged proof requires the local tip to be exactly what was merged.
    # A reused name whose branch has moved on will not match.
    if printf '%s\n' "$prs" | grep -Fxq "MERGED $tip"; then
      proof="merged-PR"
    fi
  fi

  if [ -z "$proof" ] &&
    [ "$(git rev-list --count "origin/$MAIN_BRANCH..$br")" = "0" ]; then
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

#!/usr/bin/env bash
# Picks (or validates) the main commit the "Deploy myK9Show" workflow ships.
#
# MYK9-896: the workflow used to take the first line of `gh run list` as the
# newest green commit. That order is not guaranteed, and run 36791489339 shipped
# a 2026-09-03 commit over production ~780 commits behind main. Selection now
# walks main's first-parent history newest-first and takes the first commit that
# is green, so no API ordering can matter.
#
# 2026-10-01: listing green runs (`gh run list --status success --limit 500`)
# started returning September runs first, so the 500-run window never reached
# the night's green commits and the picker refused to deploy. Greenness is now
# asked per commit (`--commit <sha>`), newest first, within the behind window.
#
#   REQUESTED_SHA  optional full 40-char SHA; explicit pins skip the behind guard
#   MAX_BEHIND     default 50; an auto-picked commit further behind main fails
#   MAIN_REF       default origin/main
#
# Needs `gh` (authenticated) and a full-history checkout with MAIN_REF fetched.
# Writes commit_sha=<sha> to $GITHUB_OUTPUT and a summary to $GITHUB_STEP_SUMMARY
# when those are set; always logs the choice to stdout.
set -euo pipefail

requested="${REQUESTED_SHA:-}"
max_behind="${MAX_BEHIND:-50}"
main_ref="${MAIN_REF:-origin/main}"

# True when main has a successful CI push run for exactly this commit.
is_green() {
  local found
  found="$(gh run list --workflow CI --branch main --event push --status success --commit "$1" --limit 1 --json headSha --jq '.[].headSha')"
  [[ "$found" == "$1" ]]
}

if [[ -z "$requested" ]]; then
  commit_sha=""
  while read -r candidate; do
    if is_green "$candidate"; then
      commit_sha="$candidate"
      break
    fi
  done < <(git rev-list --first-parent --max-count "$((max_behind + 1))" "$main_ref")
  [[ -n "$commit_sha" ]] || {
    echo "no commit within $max_behind of $main_ref on its first-parent history has a successful CI push run (limit $max_behind); refusing to roll production back. Pass commit_sha to deploy one deliberately." >&2
    exit 1
  }
  picked_by="newest green commit on the first-parent history of $main_ref"
else
  commit_sha="$requested"
  [[ "$commit_sha" =~ ^[0-9a-f]{40}$ ]] || {
    echo "commit_sha must be a full 40-character SHA" >&2
    exit 1
  }
  is_green "$commit_sha" || {
    echo "no successful main CI push run found for $commit_sha" >&2
    exit 1
  }
  picked_by="explicit commit_sha input"
fi

git merge-base --is-ancestor "$commit_sha" "$main_ref" || {
  echo "$commit_sha is not reachable from $main_ref" >&2
  exit 1
}

behind="$(git rev-list --count "$commit_sha..$main_ref")"
subject="$(git log -1 --format=%s "$commit_sha")"

if [[ -z "$requested" && "$behind" -gt "$max_behind" ]]; then
  echo "newest green commit $commit_sha is $behind commits behind $main_ref (limit $max_behind); refusing to roll production back. Pass commit_sha to deploy it deliberately." >&2
  exit 1
fi

echo "Deploying $commit_sha ($subject)"
echo "Picked by: $picked_by; $behind commit(s) on $main_ref not included"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "commit_sha=$commit_sha" >>"$GITHUB_OUTPUT"
fi
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "### myK9Show deploy"
    echo ""
    echo "- Commit: \`$commit_sha\` ($subject)"
    echo "- Picked by: $picked_by"
    echo "- Commits on main not included (still in CI or failed it): $behind"
  } >>"$GITHUB_STEP_SUMMARY"
fi

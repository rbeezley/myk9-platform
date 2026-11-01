#!/usr/bin/env bash
# Stall watcher for one Claude Code cloud session (MYK9-1602). Start it with the Bash tool's
# run_in_background in the SAME turn as the dispatch; its exit is the orchestrator's signal.
#
#   bash scripts/cloud/watch-cloud-session.sh <issue-number> <first|fix> <dispatched-at> [reviewed-sha]
#
# <dispatched-at> is the dispatch time as epoch seconds or ISO 8601. `first` watches a new
# session on `claude/myk9-<n>-*` (or any `claude/` branch whose PR body says `Fixes MYK9-<n>`)
# for a push, then a ready PR. `fix` gives the still-running session 10 min to push a new head
# after the latest findings comment (`Codex findings for <sha>`, `Claude findings for <sha>`, or
# a `Review gate:` withdrawal, from a trusted author); a later clean gate line supersedes it.
#
# Exit codes: 0 the session delivered (first: a ready PR is open; fix: a new head landed, or the
# latest gate is clean). 2 usage error only.
# 3 gh could not be reached or returned junk, or the checker itself crashed: NOT a stall, fail
# loud and look. 10 no branch
# pushed within 30 min. 11 a branch but no ready PR within 60 min. 12 fix mode: no new head
# 10 min after the findings (with no findings comment visible, after the dispatch). Any of 10, 11
# or 12 means a LOCAL TAKEOVER on the existing branch (lane reference, step 3), no owner question.
#
# Environment (tests and tuning): WATCH_POLL_S (default 60), WATCH_NO_PUSH_S (1800),
# WATCH_NO_PR_S (3600), WATCH_QUIET_S (600), WATCH_NOW_S (epoch override of the clock).
# The decision rule is scripts/cloud/watch-cloud-session.ts; this file is only the loop.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
poll_s="${WATCH_POLL_S:-60}"
while true; do
  node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$here/watch-cloud-session.ts" "$@"
  rc=$?
  case "$rc" in
    20) ;;
    0 | 2 | 3 | 10 | 11 | 12) exit "$rc" ;;
    # A crash (1), an old node (9) or a missing one (127) is not a verdict either.
    *)
      echo "watch-cloud-session: checker exited $rc (not a stall verdict)" >&2
      exit 3
      ;;
  esac
  sleep "$poll_s"
done

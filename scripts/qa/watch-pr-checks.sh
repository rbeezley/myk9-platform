#!/bin/bash
# Poll a PR's checks until every one has ANSWERED, then report a real verdict.
#
#   bash scripts/qa/watch-pr-checks.sh <pr-number> [pinned-sha]
#   bash scripts/qa/watch-pr-checks.sh --self-test   # no network; what CI runs
#
# Invoked via `bash` like every other script in scripts/qa, so it does not
# depend on the executable bit surviving a checkout.
#
# Exit codes:
#   0  settled: every check answered, zero failures
#   1  at least one check failed (named on stdout)
#   2  aborted: the PR head moved, so any verdict would describe another commit
#   3  timed out — explicitly NOT a verdict
#   4  self-test failed — the harness is broken; believe nothing it reports
#
# ---------------------------------------------------------------------------
# WHY THIS EXISTS
#
# "Is CI green?" is asked before every merge, and there are three ways to get a
# confident wrong answer. All three have happened here.
#
#  1. A poll that treats "zero pending" as settled fires in the gap between a
#     push and the new run registering, reporting the PREVIOUS head's verdict
#     for new code. Pin the SHA; abort if it moves.
#
#  2. A registered-but-unfinished check run carries a null `conclusion`, which a
#     naive "not pending" filter reads as done. Count what has ANSWERED, not
#     what exists.
#
#  3. Check RUNS report through `conclusion`. Vercel STATUS CONTEXTS report
#     through `state` and never set `conclusion` at all. A failure filter that
#     reads one field silently ignores the other.
#
#     On PR #2045 an ad-hoc version of this script tried to cover both with two
#     arms inside one array constructor:
#
#       [ .statusCheckRollup[] | select(<conclusion test>)
#       , (.statusCheckRollup[]? | select(<state test>))
#       | .name ]
#
#     jq evaluates the second arm with an ELEMENT as its input, not the root, so
#     `.statusCheckRollup` is null there — and `?` swallowed the error. It
#     matched nothing, ever. The script printed `failed=[]` for forty minutes on
#     a PR with two failing Vercel deploys. Only an unrelated wrong constant
#     stopped it declaring green and the PR being merged on a red board.
#
#     The correct shape is ONE select with `or`. No second arm, no `?` to hide
#     an error, and a self-test that proves it against a rollup that HAS a
#     failure — because an untested detector reports its own bugs as good news.
# ---------------------------------------------------------------------------
set -uo pipefail

# A check has ANSWERED when either field carries a terminal value.
JQ_UNANSWERED='[.statusCheckRollup[]
  | select(
      ((.conclusion // "") == "")
      and (((.state // "") | IN("SUCCESS","FAILURE","ERROR")) | not)
    )] | length'

JQ_FAILED='[.statusCheckRollup[]
  | select(
      ((.conclusion // "") | IN("FAILURE","TIMED_OUT","CANCELLED","ACTION_REQUIRED"))
      or ((.state // "") | IN("FAILURE","ERROR"))
    )
  | .name // .context] | unique | join(", ")'

# --- Known-answer self-test -------------------------------------------------
# Runs on EVERY invocation, not behind a flag. A watcher that cannot see a
# failure is worse than no watcher, because it produces a confident green.
# Each fixture is a shape that has actually broken something.
self_test() {
  local fixture got ok=0

  # 1. Vercel failure: state only, no conclusion. THE #2045 regression.
  fixture='{"statusCheckRollup":[{"context":"Vercel - app","state":"FAILURE"}]}'
  got=$(printf '%s' "$fixture" | jq -r "$JQ_FAILED")
  [ "$got" = "Vercel - app" ] ||
    { echo "SELF-TEST FAIL: vercel state failure not detected (got '$got')"; ok=1; }

  # 2. Check-run failure: conclusion only.
  fixture='{"statusCheckRollup":[{"name":"Build","conclusion":"FAILURE","status":"COMPLETED"}]}'
  got=$(printf '%s' "$fixture" | jq -r "$JQ_FAILED")
  [ "$got" = "Build" ] ||
    { echo "SELF-TEST FAIL: run conclusion failure not detected (got '$got')"; ok=1; }

  # 3. All green must report NO failure. Guards the opposite error — a detector
  #    that flags everything is as useless as one that flags nothing.
  fixture='{"statusCheckRollup":[{"name":"Build","conclusion":"SUCCESS"},{"context":"Vercel - app","state":"SUCCESS"},{"name":"Cov","conclusion":"SKIPPED"}]}'
  got=$(printf '%s' "$fixture" | jq -r "$JQ_FAILED")
  [ -z "$got" ] ||
    { echo "SELF-TEST FAIL: green rollup reported failures ('$got')"; ok=1; }

  # 4. An in-flight run must count as unanswered.
  fixture='{"statusCheckRollup":[{"name":"Build","conclusion":null,"status":"IN_PROGRESS"},{"name":"Test","conclusion":"SUCCESS"}]}'
  got=$(printf '%s' "$fixture" | jq "$JQ_UNANSWERED")
  [ "$got" = "1" ] ||
    { echo "SELF-TEST FAIL: in-flight run not counted unanswered (got '$got')"; ok=1; }

  # 5. A FAILED Vercel context HAS answered. If it read as pending the poll
  #    would spin forever on a red that already reported.
  fixture='{"statusCheckRollup":[{"context":"Vercel - app","state":"FAILURE"}]}'
  got=$(printf '%s' "$fixture" | jq "$JQ_UNANSWERED")
  [ "$got" = "0" ] ||
    { echo "SELF-TEST FAIL: failed vercel context counted unanswered (got '$got')"; ok=1; }

  if [ "$ok" -ne 0 ]; then
    echo "Harness self-test FAILED — refusing to report on real CI."
    exit 4
  fi
  echo "self-test 5/5: vercel-state, run-conclusion, all-green, in-flight, answered-red"
}

if [ "${1:-}" = "--self-test" ]; then
  self_test
  exit 0
fi

PR="${1:?usage: watch-pr-checks.sh <pr-number> [pinned-sha] | --self-test}"
self_test

PINNED="${2:-$(gh pr view "$PR" --json headRefOid --jq .headRefOid)}"
POLL_SECONDS="${MYK9_PR_POLL_SECONDS:-60}"
TIMEOUT_SECONDS="${MYK9_PR_TIMEOUT_SECONDS:-2400}"
echo "watching PR #$PR pinned to $PINNED"

DEADLINE=$(( $(date +%s) + TIMEOUT_SECONDS ))

while :; do
  HEAD=$(gh pr view "$PR" --json headRefOid --jq .headRefOid 2>/dev/null)
  if [ "$HEAD" != "$PINNED" ]; then
    echo "ABORT: head moved $PINNED -> $HEAD; a verdict here would describe a different commit"
    exit 2
  fi

  ROLLUP=$(gh pr view "$PR" --json statusCheckRollup 2>/dev/null)
  TOTAL=$(printf '%s' "$ROLLUP" | jq '.statusCheckRollup | length')
  UNANSWERED=$(printf '%s' "$ROLLUP" | jq "$JQ_UNANSWERED")
  FAILED=$(printf '%s' "$ROLLUP" | jq -r "$JQ_FAILED")

  echo "$(date +%H:%M:%S) total=$TOTAL unanswered=$UNANSWERED failed=[$FAILED]"

  # Report a failure the moment it answers. Nothing is learned by waiting out
  # the rest of a twenty-minute fan-out for a verdict already decided.
  if [ -n "$FAILED" ]; then
    echo "FAILED on $PINNED: $FAILED"
    exit 1
  fi

  # Deliberately NO hard expected-check-count. A hardcoded fan-out is its own
  # staleness trap: #2045 registered 16 where the recorded figure was 17, and
  # requiring 17 turned a settled board into a timeout. "Nothing unanswered"
  # plus the SHA pin is the verdict; a suspiciously small rollup stays visible
  # as `total=` in the log for a human to judge.
  if [ "$UNANSWERED" -eq 0 ] && [ "$TOTAL" -gt 0 ]; then
    echo "SETTLED on $PINNED: $TOTAL checks, all answered, zero failures"
    exit 0
  fi

  if [ "$(date +%s)" -gt "$DEADLINE" ]; then
    echo "TIMEOUT after ${TIMEOUT_SECONDS}s: total=$TOTAL unanswered=$UNANSWERED — NOT a verdict"
    exit 3
  fi

  sleep "$POLL_SECONDS"
done

#!/bin/bash
# Poll a PR's checks until the REQUIRED ones have answered, then report a verdict.
#
#   bash scripts/qa/watch-pr-checks.sh <pr-number> [pinned-sha]
#   bash scripts/qa/watch-pr-checks.sh --self-test   # no network; what CI runs
#
# Invoked via `bash` like every other script in scripts/qa, so it does not
# depend on the executable bit surviving a checkout.
#
# Exit codes:
#   0  every REQUIRED check answered green
#   1  a REQUIRED check failed (named on stdout) — a hard stop
#   2  aborted: the PR head moved, so a verdict would describe another commit
#   3  timed out — explicitly NOT a verdict
#   4  self-test failed — the harness is broken; believe nothing it reports
#   5  required checks are green but a NON-required check failed — caller decides
#
# ---------------------------------------------------------------------------
# WHY THIS EXISTS
#
# "Is CI green?" is asked before every merge, and there are four ways to get a
# confident wrong answer. All four have happened here.
#
#  1. A poll that treats "zero pending" as settled fires in the gap between a
#     push and the new run registering, reporting the PREVIOUS head's verdict
#     for new code. Pin the SHA; abort if it moves.
#
#  2. A registered-but-unfinished check run carries a null `conclusion`, which a
#     naive "not pending" filter reads as done. Count what has ANSWERED.
#
#  3. Check RUNS report through `conclusion`. Vercel STATUS CONTEXTS report
#     through `state` and never set `conclusion` at all. A failure filter that
#     reads one field silently ignores the other.
#
#     On PR #2045 an ad-hoc version tried to cover both with two arms inside one
#     array constructor — `[ .[] | select(A) , (.[]? | select(B)) | .name ]`.
#     jq evaluates the second arm with an ELEMENT as its input, not the root, so
#     `.statusCheckRollup` is null there and `?` swallowed the error. It matched
#     nothing, ever: `failed=[]` for forty minutes on a PR with two failing
#     Vercel deploys. The correct shape is ONE select with `or`.
#
#  4. "Nothing unanswered" is NOT settled when nothing has registered yet. A
#     rollup holding only a fast status context — `Vercel Preview Comments:
#     SUCCESS`, seconds after a push — has zero unanswered and would read green
#     before a single CI job exists. Counting is the wrong instrument: an
#     earlier version guarded this with a hardcoded expected total, which was
#     itself wrong (17 recorded, 16 actual) and turned a settled board into a
#     timeout.
#
#     The authoritative answer is the repo's own ruleset. This queries
#     `main-required-checks` for the contexts GitHub actually requires and waits
#     for exactly those. No magic number, and it tracks the ruleset if it
#     changes.
#
# NON-REQUIRED FAILURES ARE A SEPARATE VERDICT (exit 5), not a stop. Vercel
# preview contexts are deliberately not required (AGENTS.md § Vercel Hobby quota
# / preview deploy discipline) because this Hobby account hits the daily
# deployment limit. Collapsing that into exit 1 would block shipping on a quota
# artifact; collapsing it into exit 0 would hide a real preview break. It gets
# its own code so the caller can apply the documented judgement.
# ---------------------------------------------------------------------------
set -uo pipefail

REPO="${MYK9_PR_REPO:-rbeezley/myk9-platform}"
RULESET_NAME="${MYK9_PR_RULESET:-main-required-checks}"

# Classification is an ALLOWLIST OF PASSING, not a denylist of failing.
#
# The first version listed the failure conclusions — FAILURE, TIMED_OUT,
# CANCELLED, ACTION_REQUIRED — and treated everything else answered as green.
# That is fail-OPEN: GitHub's `STALE` conclusion sailed through it, and so did
# any value GitHub might add later. Measured on the previous commit: a required
# check with conclusion STALE returned `green`, and so did the invented
# `SOME_NEW_STATE`. Raised in review of #2053.
#
# Only SUCCESS, NEUTRAL and SKIPPED pass. Anything else that has ANSWERED is a
# failure, including conclusions that do not exist yet.
JQ_DEFS='
  def answered:
    ((.conclusion // "") != "")
    or ((.state // "") | IN("SUCCESS","FAILURE","ERROR"));
  def passing:
    if (.conclusion // "") != ""
    then (.conclusion | IN("SUCCESS","NEUTRAL","SKIPPED"))
    else ((.state // "") == "SUCCESS")
    end;
'

JQ_ANSWERED_NAMES='[.statusCheckRollup[] | select(answered) | .name // .context]'
JQ_FAILED_NAMES='[.statusCheckRollup[] | select(answered and (passing | not)) | .name // .context]'

# verdict <rollup-json> <required-json-array>
#
# Echoes exactly one of:
#   green
#   required-failed:<names>
#   preview-failed:<names>
#   waiting:<what is still missing or unanswered>
#
# Pure: no network, no globals. Everything the self-test exercises goes through
# here, so the fixtures test the real decision and not a paraphrase of it.
verdict() {
  local rollup="$1" required="$2"
  jq -rn --argjson r "$rollup" --argjson req "$required" "
    $JQ_DEFS
    (\$r | $JQ_ANSWERED_NAMES) as \$answered
    | (\$r | $JQ_FAILED_NAMES) as \$failed
    | (\$req - \$answered) as \$pending
    | (\$failed | map(select(. as \$f | \$req | index(\$f)))) as \$reqFailed
    | (\$failed | map(select(. as \$f | \$req | index(\$f) | not))) as \$otherFailed
    | if   (\$reqFailed  | length) > 0 then \"required-failed:\" + (\$reqFailed  | join(\", \"))
      elif (\$pending    | length) > 0 then \"waiting:\"         + (\$pending    | join(\", \"))
      elif (\$otherFailed| length) > 0 then \"preview-failed:\"  + (\$otherFailed| join(\", \"))
      else \"green\" end
  "
}

# --- Known-answer self-test -------------------------------------------------
# Runs on EVERY invocation, not behind a flag. A watcher that cannot see a
# failure is worse than no watcher, because it produces a confident green.
# Each fixture is a shape that has actually caused a wrong answer.
self_test() {
  local req='["Quality Checks","Test"]' got ok=0

  check() { # check <label> <expected> <rollup>
    got=$(verdict "$3" "$req")
    [ "$got" = "$2" ] || { echo "SELF-TEST FAIL [$1]: expected '$2', got '$got'"; ok=1; }
  }

  # 1. Vercel failure reports through `state` only. THE #2045 regression: a
  #    conclusion-only filter misses it entirely.
  check vercel-state 'preview-failed:Vercel - app' \
    '{"statusCheckRollup":[{"name":"Quality Checks","conclusion":"SUCCESS"},{"name":"Test","conclusion":"SUCCESS"},{"context":"Vercel - app","state":"FAILURE"}]}'

  # 2. Check-run failure reports through `conclusion` only.
  check run-conclusion 'required-failed:Test' \
    '{"statusCheckRollup":[{"name":"Quality Checks","conclusion":"SUCCESS"},{"name":"Test","conclusion":"FAILURE"}]}'

  # 3. All green must be green. Guards the opposite error — a detector that
  #    flags everything blocks every merge.
  check all-green 'green' \
    '{"statusCheckRollup":[{"name":"Quality Checks","conclusion":"SUCCESS"},{"name":"Test","conclusion":"SKIPPED"},{"context":"Vercel - app","state":"SUCCESS"}]}'

  # 4. An in-flight required run is not an answer.
  check in-flight 'waiting:Test' \
    '{"statusCheckRollup":[{"name":"Quality Checks","conclusion":"SUCCESS"},{"name":"Test","conclusion":null,"status":"IN_PROGRESS"}]}'

  # 5. PARTIAL ROLLUP. Seconds after a push a fast status context can be the
  #    only thing present. Zero unanswered, zero failures — and not remotely
  #    settled. Counting could not tell this from a finished board; requiring
  #    the ruleset's contexts can.
  check partial-rollup 'waiting:Quality Checks, Test' \
    '{"statusCheckRollup":[{"context":"Vercel Preview Comments","state":"SUCCESS"}]}'

  # 6. Empty rollup — the same trap with nothing at all in it.
  check empty-rollup 'waiting:Quality Checks, Test' '{"statusCheckRollup":[]}'

  # 7. A required failure OUTRANKS a preview failure: report the blocking one.
  check required-beats-preview 'required-failed:Quality Checks' \
    '{"statusCheckRollup":[{"name":"Quality Checks","conclusion":"FAILURE"},{"name":"Test","conclusion":"SUCCESS"},{"context":"Vercel - app","state":"FAILURE"}]}'

  # 8. A required check that FAILED has still answered — it must not read as
  #    pending, or the poll spins forever on a red that already reported.
  check answered-red 'required-failed:Test' \
    '{"statusCheckRollup":[{"name":"Quality Checks","conclusion":"SUCCESS"},{"name":"Test","conclusion":"FAILURE"}]}'

  # 9. STALE is answered and is NOT a pass. A denylist of failure conclusions
  #    let it through as green.
  check stale-conclusion 'required-failed:Test' \
    '{"statusCheckRollup":[{"name":"Quality Checks","conclusion":"SUCCESS"},{"name":"Test","conclusion":"STALE"}]}'

  # 10. The general form, and the reason this is an allowlist: a conclusion
  #     value nobody has seen yet must fail closed, not green.
  check unknown-conclusion 'required-failed:Test' \
    '{"statusCheckRollup":[{"name":"Quality Checks","conclusion":"SUCCESS"},{"name":"Test","conclusion":"SOME_FUTURE_VALUE"}]}'

  # 11. NEUTRAL and SKIPPED are genuine passes — an allowlist that forgot them
  #     would block on checks GitHub considers satisfied.
  check neutral-and-skipped 'green' \
    '{"statusCheckRollup":[{"name":"Quality Checks","conclusion":"NEUTRAL"},{"name":"Test","conclusion":"SKIPPED"}]}'

  if [ "$ok" -ne 0 ]; then
    echo "Harness self-test FAILED — refusing to report on real CI."
    exit 4
  fi
  echo "self-test 11/11: vercel-state, run-conclusion, all-green, in-flight, partial-rollup, empty-rollup, required-beats-preview, answered-red, stale-conclusion, unknown-conclusion, neutral-and-skipped"
}

if [ "${1:-}" = "--self-test" ]; then
  self_test
  exit 0
fi

PR="${1:?usage: watch-pr-checks.sh <pr-number> [pinned-sha] | --self-test}"
self_test

# The repo's own ruleset is the authority on what "green" means. Fail CLOSED if
# it cannot be read: guessing a required set is how a false green happens.
REQUIRED=$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name==\"$RULESET_NAME\") | .id" 2>/dev/null |
  head -1 |
  xargs -I{} gh api "repos/$REPO/rulesets/{}" \
    --jq '[.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context]' 2>/dev/null)

if [ -z "$REQUIRED" ] || [ "$REQUIRED" = "[]" ]; then
  echo "ABORT: could not read required checks from ruleset '$RULESET_NAME' on $REPO."
  echo "Refusing to invent a definition of green. Check ruleset access, then retry."
  exit 4
fi
echo "required checks: $(printf '%s' "$REQUIRED" | jq -r 'join(", ")')"

PINNED="${2:-$(gh pr view "$PR" --json headRefOid --jq .headRefOid)}"
POLL_SECONDS="${MYK9_PR_POLL_SECONDS:-60}"
TIMEOUT_SECONDS="${MYK9_PR_TIMEOUT_SECONDS:-2400}"
echo "watching PR #$PR pinned to $PINNED"

DEADLINE=$(( $(date +%s) + TIMEOUT_SECONDS ))

while :; do
  # ONE request for both fields. Querying the head and the rollup separately
  # leaves a window where a push lands between them: the checks then belong to
  # the NEW head while the verdict is reported against $PINNED, and the script
  # can exit green before it ever notices the move. Validating the SHA that came
  # back in the SAME response closes it. Raised in review of #2053.
  RESPONSE=$(gh pr view "$PR" --json headRefOid,statusCheckRollup 2>/dev/null)
  HEAD=$(printf '%s' "$RESPONSE" | jq -r '.headRefOid // ""')

  if [ -z "$HEAD" ]; then
    echo "WARN: could not read PR state; retrying"
    sleep "$POLL_SECONDS"
    continue
  fi

  if [ "$HEAD" != "$PINNED" ]; then
    echo "ABORT: head moved $PINNED -> $HEAD; a verdict here would describe a different commit"
    exit 2
  fi

  RESULT=$(verdict "$RESPONSE" "$REQUIRED")
  TOTAL=$(printf '%s' "$RESPONSE" | jq '.statusCheckRollup | length')

  echo "$(date +%H:%M:%S) total=$TOTAL $RESULT"

  case "$RESULT" in
    green)
      echo "GREEN on $PINNED: every required check answered green ($TOTAL checks seen)"
      exit 0
      ;;
    required-failed:*)
      # Report the moment it answers. Nothing is learned by waiting out the rest
      # of a fan-out for a verdict already decided.
      echo "REQUIRED CHECK FAILED on $PINNED: ${RESULT#required-failed:}"
      exit 1
      ;;
    preview-failed:*)
      echo "REQUIRED CHECKS GREEN, non-required failed on $PINNED: ${RESULT#preview-failed:}"
      echo "Vercel previews are deliberately not required (AGENTS.md § Vercel Hobby quota"
      echo "/ preview deploy discipline). Non-blocking IF this is the daily deployment"
      echo "limit AND the preview is not needed for visual QA — confirm which before shipping."
      exit 5
      ;;
  esac

  if [ "$(date +%s)" -gt "$DEADLINE" ]; then
    echo "TIMEOUT after ${TIMEOUT_SECONDS}s: $RESULT — NOT a verdict"
    exit 3
  fi

  sleep "$POLL_SECONDS"
done

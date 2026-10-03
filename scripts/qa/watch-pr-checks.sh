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
# "Is CI green?" is asked before every merge, and there are five ways to get a
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
#  5. A rollup holds EVERY attempt, not just the latest. A draft->ready PR keeps
#     the draft run's SKIPPED rows beside the ready run's fresh IN_PROGRESS ones
#     (#2672: exit 0 "GREEN" while Quality Checks was still running), and a
#     CANCELLED attempt sits beside its SUCCESS replacement (#2675: a false
#     exit 5). Each check name is therefore judged by its CURRENT attempt only:
#     the highest job id (from detailsUrl), startedAt as tie-break, never array
#     position. A current answer is also STALE, and counted as still pending, when
#     a newer run of the same workflow on this head has an unanswered current
#     attempt, so a required name the new run has not registered yet cannot borrow
#     an older skip or success. A required check whose only attempt is an
#     intentional skip has no newer sibling and still passes.
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
  def key: .name // .context;
  # Ids come from detailsUrl (.../actions/runs/<run>/job/<job>). GitHub allocates
  # run and job ids monotonically; status contexts have neither, so they read 0.
  def runid: ((.detailsUrl // "") | capture("/runs/(?<n>[0-9]+)")? | .n | tonumber) // 0;
  def jobid: ((.detailsUrl // "") | capture("/job/(?<n>[0-9]+)")? | .n | tonumber) // 0;
  # A queued job can carry the zero date; that is "unknown", never "oldest".
  def started: (.startedAt // "") | if startswith("0001") then "" else . end;
  # THE ORDERING RULE (MYK9-947). Among the attempts sharing a check name the
  # CURRENT one is the highest job id: a re-run, a draft->ready run and the
  # replacement of a cancelled run each get a NEW job id. startedAt breaks ties
  # and is the only signal for id-less status contexts. Array position is never
  # consulted. Superseded attempts are ignored entirely.
  def current: [ .statusCheckRollup | group_by(key)[] | sort_by([jobid, started]) | last ];
  # STALE: an attempt is stale when a newer run of the SAME workflow on this head
  # still has an unanswered current attempt. Its answer (a draft-run SKIPPED, an
  # old SUCCESS) predates work still in flight, and a required name the newer run
  # has not registered yet must not borrow it. A required check whose ONLY attempt
  # is an intentional skip has no newer sibling, so it is not stale and still passes.
  def stale($cur):
    . as $row
    | (runid > 0) and ((.workflowName // "") != "")
      and any($cur[]; (.workflowName // "") == ($row.workflowName // "")
                      and runid > ($row | runid) and (answered | not));
'

JQ_VERDICT='
  ($r | current) as $cur
  | [$cur[] | select(answered and (stale($cur) | not)) | key] as $settled
  | [$cur[] | select(answered and (passing | not) and (stale($cur) | not)) | key] as $failed
  | ($req - $settled) as $pending
  | ($failed | map(select(. as $f | $req | index($f)))) as $reqFailed
  | ($failed | map(select(. as $f | $req | index($f) | not))) as $otherFailed
  | if   ($reqFailed   | length) > 0 then "required-failed:" + ($reqFailed   | join(", "))
    elif ($pending     | length) > 0 then "waiting:"         + ($pending     | join(", "))
    elif ($otherFailed | length) > 0 then "preview-failed:"  + ($otherFailed | join(", "))
    else "green" end
'

JQ_OUTSTANDING='
  [($r | current)[] | select((answered | not) and (key as $k | $req | index($k) | not)) | key]
  | join(", ")
'

# verdict <rollup-json> <required-json-array>
#
# Echoes exactly one of:
#   green
#   required-failed:<names>
#   preview-failed:<names>
#   waiting:<what is still missing or unanswered>
#
# Each check name is judged by its CURRENT attempt only (`current`, `stale`).
# Pure: no network, no globals. Everything the self-test exercises goes through
# here, so the fixtures test the real decision and not a paraphrase of it.
verdict() {
  jq -rn --argjson r "$1" --argjson req "$2" "$JQ_DEFS $JQ_VERDICT"
}

# outstanding <rollup-json> <required-json-array>
# CURRENT attempts that have not answered and are NOT required. A pending
# required name is `waiting:`, never "non-required".
outstanding() {
  jq -rn --argjson r "$1" --argjson req "$2" "$JQ_DEFS $JQ_OUTSTANDING"
}

# preview_note_applies <comma-joined names>: true only when EVERY name is a
# Vercel context, the one class the quota exception covers.
preview_note_applies() {
  local names="$1" rest n
  [ -n "$names" ] || return 1
  rest="$names, "
  while [ -n "$rest" ]; do
    n="${rest%%, *}"
    rest="${rest#*, }"
    case "$n" in Vercel*) ;; *) return 1 ;; esac
  done
  return 0
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

  # --- Current-attempt fixtures (MYK9-947) ---------------------------------
  # Each runs in BOTH array orders, because the old code's answer depended on
  # position. row <name> <workflow> <conclusion|""> <startedAt> <run> <job>
  row() {
    printf '{"name":"%s","workflowName":"%s","status":"%s","conclusion":"%s","startedAt":"%s","detailsUrl":"https://github.com/o/r/actions/runs/%s/job/%s"}' \
      "$1" "$2" "$([ -n "$3" ] && echo COMPLETED || echo IN_PROGRESS)" "$3" "$4" "$5" "$6"
  }
  check_both() { # check_both <label> <expected> <old-first rows, comma-joined>
    check "$1/old-first" "$2" "{\"statusCheckRollup\":[$3]}"
    check "$1/new-first" "$2" "$(printf '{"statusCheckRollup":[%s]}' "$3" | jq -c '.statusCheckRollup |= reverse')"
  }

  # 12. #2672 draft->ready: the draft run skipped Quality Checks and Test; the
  #     ready run's Quality Checks is IN_PROGRESS and Test has not registered.
  #     The old skips are not answers.
  check_both draft-ready-stale-skip 'waiting:Quality Checks, Test' \
    "$(row 'Quality Checks' CI SKIPPED 2026-10-02T19:00:00Z 37036652479 110950000001),$(row Test CI SKIPPED 2026-10-02T19:00:00Z 37036652479 110950000002),$(row 'Quality Checks' CI '' 2026-10-02T19:20:25Z 37037770166 110950000100)"

  # 13. Same, but the ready run has also registered Test (queued).
  check_both draft-ready-both-registered 'waiting:Quality Checks, Test' \
    "$(row 'Quality Checks' CI SKIPPED 2026-10-02T19:00:00Z 37036652479 110950000001),$(row Test CI SKIPPED 2026-10-02T19:00:00Z 37036652479 110950000002),$(row 'Quality Checks' CI '' 2026-10-02T19:20:25Z 37037770166 110950000100),$(row Test CI '' 0001-01-01T00:00:00Z 37037770166 110950000101)"

  # 14. #2675: an old CANCELLED evaluator run beside its SUCCESS replacement
  #     (3 seconds newer). Not a failure. The evaluator is non-required here.
  check_both cancelled-then-success 'green' \
    "$(row 'Quality Checks' CI SUCCESS 2026-10-02T20:31:40Z 37061146000 110990000001),$(row Test CI SUCCESS 2026-10-02T20:31:40Z 37061146000 110990000002),$(row 'Evaluate review evidence' 'Review gate' CANCELLED 2026-10-02T20:31:40Z 37061146506 110990000010),$(row 'Evaluate review evidence' 'Review gate' SUCCESS 2026-10-02T20:31:43Z 37061146762 110990000020)"

  # 15. The reverse: a SUCCESS superseded by a newer FAILURE is a failure.
  check_both fresh-failure-beats-old-success 'required-failed:Test' \
    "$(row 'Quality Checks' CI SUCCESS 2026-10-02T20:00:00Z 100 1),$(row Test CI SUCCESS 2026-10-02T20:00:00Z 100 2),$(row Test CI FAILURE 2026-10-02T20:10:00Z 200 3)"

  # 16. A required CANCELLED superseded by a newer SUCCESS is green.
  check_both required-cancelled-then-success 'green' \
    "$(row 'Quality Checks' CI SUCCESS 2026-10-02T20:00:00Z 100 1),$(row Test CI CANCELLED 2026-10-02T20:00:00Z 100 2),$(row Test CI SUCCESS 2026-10-02T20:10:00Z 200 3)"

  # 17. A required check whose ONLY attempt is an intentional SKIPPED stays green.
  check_both single-intentional-skip 'green' \
    "$(row 'Quality Checks' CI SUCCESS 2026-10-02T20:00:00Z 100 1),$(row Test CI SKIPPED 2026-10-02T20:00:00Z 100 2)"

  # 18. A fresh failure beats an old skip too.
  check_both fresh-failure-beats-old-skip 'required-failed:Test' \
    "$(row 'Quality Checks' CI SUCCESS 2026-10-02T20:10:00Z 200 4),$(row Test CI SKIPPED 2026-10-02T20:00:00Z 100 2),$(row Test CI FAILURE 2026-10-02T20:10:00Z 200 5)"

  # 19. A pending REQUIRED name is never listed as non-required outstanding, and
  #     a superseded unanswered attempt is not listed at all.
  got=$(outstanding "{\"statusCheckRollup\":[$(row 'Quality Checks' CI '' 2026-10-02T19:20:25Z 200 3),$(row Lint CI '' 2026-10-02T19:00:00Z 100 1),$(row Lint CI SUCCESS 2026-10-02T19:20:25Z 200 4),$(row Docs CI '' 2026-10-02T19:20:25Z 200 5)]}" "$req")
  [ "$got" = "Docs" ] || { echo "SELF-TEST FAIL [outstanding]: expected 'Docs', got '$got'"; ok=1; }

  # 20. The Vercel quota note applies only when every failure is a Vercel one.
  preview_note_applies "Vercel - app, Vercel - docs" || { echo "SELF-TEST FAIL [note-vercel]"; ok=1; }
  if preview_note_applies "Evaluate review evidence"; then echo "SELF-TEST FAIL [note-non-vercel]"; ok=1; fi
  if preview_note_applies "Vercel - app, Evaluate review evidence"; then echo "SELF-TEST FAIL [note-mixed]"; ok=1; fi

  if [ "$ok" -ne 0 ]; then
    echo "Harness self-test FAILED — refusing to report on real CI."
    exit 4
  fi
  echo "self-test 11/11 + 7 current-attempt fixtures x2 orders: vercel-state, run-conclusion, all-green, in-flight, partial-rollup, empty-rollup, required-beats-preview, answered-red, stale-conclusion, unknown-conclusion, neutral-and-skipped, draft-ready-stale-skip, draft-ready-both-registered, cancelled-then-success, fresh-failure-beats-old-success, required-cancelled-then-success, single-intentional-skip, fresh-failure-beats-old-skip"
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

# --repo on every PR query, so the checks being read and the ruleset defining
# "required" always come from the SAME repository. Without it the ruleset used
# $REPO while `gh pr view` used the checkout's default remote, which could
# evaluate an unrelated PR against the wrong requirements.
PINNED="${2:-$(gh pr view "$PR" --repo "$REPO" --json headRefOid --jq .headRefOid)}"
if [ -z "$PINNED" ]; then
  echo "ABORT: could not read the head SHA for PR #$PR on $REPO."
  exit 4
fi
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
  RESPONSE=$(gh pr view "$PR" --repo "$REPO" --json headRefOid,statusCheckRollup 2>/dev/null)
  HEAD=$(printf '%s' "$RESPONSE" | jq -r '.headRefOid // ""')

  if [ -z "$HEAD" ]; then
    # The deadline is checked HERE too, not only on the polling path below. An
    # outage, a rate limit or an expired token makes every read fail, and a bare
    # `continue` would retry forever — hanging the shipping workflow instead of
    # returning "no verdict". Raised in review of #2053.
    if [ "$(date +%s)" -gt "$DEADLINE" ]; then
      echo "TIMEOUT after ${TIMEOUT_SECONDS}s: could not read PR state from $REPO — NOT a verdict"
      exit 3
    fi
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
      # Green means the REQUIRED set passed, not that the board is finished.
      # Anything still unanswered here is non-required by definition — but it can
      # still turn red afterwards, and CI's Build depends on Test, so a preview
      # or downstream job may report later. Without this line the caller cannot
      # tell "nothing else outstanding" from "the slow ones have not landed yet",
      # which makes an identical failure blocking or ignored purely on timing.
      # Raised in review of #2053.
      OUTSTANDING=$(outstanding "$RESPONSE" "$REQUIRED")
      if [ -n "$OUTSTANDING" ]; then
        echo "STILL OUTSTANDING (non-required, may yet fail): $OUTSTANDING"
        echo "Apply the same judgement as exit 5 before merging: is any of these needed"
        echo "for visual QA, and would a late failure in one matter for this diff?"
      else
        echo "Nothing outstanding: every check on the board has answered."
      fi
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
      if preview_note_applies "${RESULT#preview-failed:}"; then
        echo "Vercel previews are deliberately not required (AGENTS.md § Vercel Hobby quota"
        echo "/ preview deploy discipline). Non-blocking IF this is the daily deployment"
        echo "limit AND the preview is not needed for visual QA — confirm which before shipping."
      else
        echo "At least one failure is NOT a Vercel preview, so the Vercel quota exception does"
        echo "not apply. Open the failed check and judge it on its own merits before shipping."
      fi
      exit 5
      ;;
  esac

  if [ "$(date +%s)" -gt "$DEADLINE" ]; then
    echo "TIMEOUT after ${TIMEOUT_SECONDS}s: $RESULT — NOT a verdict"
    exit 3
  fi

  sleep "$POLL_SECONDS"
done

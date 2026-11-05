#!/bin/bash
# Sourced by watch-pr-checks.sh (never run directly): detects a PR that conflicts
# with its base, and holds the extra known-answer fixtures that live beside it.
#
# WHY (MYK9-1710): a PR that conflicts with its base gets NO workflow runs and
# nothing says so, so the watcher polled until it timed out (exit 3, "not a
# verdict") and the agent then spent time diagnosing missing runs. GitHub states
# it plainly on the pull object: `mergeable: false` / `mergeable_state: "dirty"`
# / `merge_commit_sha: null`. `mergeable: null` means "not computed yet", never a
# conflict, so it keeps polling.

# mergeable_verdict <pull-json>: echoes `conflict`, `unknown` or `ok`. Pure.
# Anything unparseable is `unknown`: an unreadable answer must not stop a watch.
mergeable_verdict() {
  [ -n "$1" ] || { echo unknown; return; } # a failed fetch prints nothing
  printf '%s' "$1" | jq -r '
    if (.mergeable == false) or ((.mergeable_state // "") == "dirty") then "conflict"
    elif .mergeable == null then "unknown"
    else "ok" end' 2>/dev/null || echo unknown
}

# no_required_registered <rollup-json> <required-json-array>: true when none of
# the required names has registered a CHECK RUN yet, the shape a conflicting PR
# keeps. Status contexts (`.context`) are ignored: `Review gate` is a required
# status posted by a pull_request_target run against the base, so it registers
# on a conflicting PR too, and counting it would hide every conflict.
no_required_registered() {
  printf '%s' "$1" | jq -e --argjson req "$2" \
    '[.statusCheckRollup[] | select(.name != null) | .name] as $seen | all($req[]; . as $r | $seen | index($r) | not)' >/dev/null 2>&1
}

fetch_mergeable() {
  gh api "repos/$REPO/pulls/$PR" --jq '{mergeable, mergeable_state, merge_commit_sha}' 2>/dev/null
}

# base_conflict <rollup-json> <required-json-array>: true only when no required
# check has registered AND GitHub says the PR conflicts. Called only while the
# verdict is still `waiting`, so a PR whose checks run pays no extra API call.
base_conflict() {
  no_required_registered "$1" "$2" || return 1
  [ "$(mergeable_verdict "$(fetch_mergeable)")" = conflict ]
}

# extra_self_test <required-json-array>: prints each failure, returns 1 if any.
extra_self_test() {
  local req="$1" got ok=0 rest_runs='[{"id":100,"name":"CI"},{"id":200,"name":"CI"}]'

  mv_check() { # mv_check <label> <expected> <pull-json>
    got=$(mergeable_verdict "$3")
    [ "$got" = "$2" ] || { echo "SELF-TEST FAIL [mergeable-$1]: expected '$2', got '$got'"; ok=1; }
  }
  mv_check conflicting-false conflict '{"mergeable":false,"mergeable_state":"dirty","merge_commit_sha":null}'
  mv_check conflicting-dirty-only conflict '{"mergeable":null,"mergeable_state":"dirty","merge_commit_sha":null}'
  mv_check not-computed-yet unknown '{"mergeable":null,"mergeable_state":"unknown","merge_commit_sha":null}'
  mv_check mergeable ok '{"mergeable":true,"mergeable_state":"clean","merge_commit_sha":"abc"}'
  mv_check blocked-is-not-conflict ok '{"mergeable":true,"mergeable_state":"blocked","merge_commit_sha":"abc"}'
  mv_check unparseable unknown 'deadbeef'

  # base_conflict end to end with the fetch stubbed (no network). The real
  # fetch is restored afterwards.
  local real_fetch
  real_fetch=$(declare -f fetch_mergeable)
  bc_check() { # bc_check <label> <expect 0|1> <pull-json> <rollup>
    STUB_PULL="$3"
    fetch_mergeable() { printf '%s' "$STUB_PULL"; }
    base_conflict "$4" '["Quality Checks","Test","Review gate"]' # the real set carries the Review gate status
    got=$?
    [ "$got" = "$2" ] || { echo "SELF-TEST FAIL [base-conflict-$1]: expected rc $2, got $got"; ok=1; }
  }
  local none='{"statusCheckRollup":[{"context":"Vercel Preview Comments","state":"SUCCESS"}]}'
  local some='{"statusCheckRollup":[{"name":"Quality Checks","conclusion":null,"status":"IN_PROGRESS"}]}'
  bc_check conflicting-no-runs 0 '{"mergeable":false,"mergeable_state":"dirty"}' "$none"
  bc_check null-keeps-waiting 1 '{"mergeable":null,"mergeable_state":"unknown"}' "$none"
  bc_check mergeable-unchanged 1 '{"mergeable":true,"mergeable_state":"clean"}' "$none"
  bc_check conflicting-but-runs-registered 1 '{"mergeable":false,"mergeable_state":"dirty"}' "$some"
  # The real conflicting shape: the base-run Review gate status is present, red or green.
  local gate_red='{"statusCheckRollup":[{"context":"Review gate","state":"FAILURE"}]}'
  local gate_green='{"statusCheckRollup":[{"context":"Review gate","state":"SUCCESS"}]}'
  bc_check conflicting-review-gate-red 0 '{"mergeable":false,"mergeable_state":"dirty"}' "$gate_red"
  bc_check conflicting-review-gate-green 0 '{"mergeable":false,"mergeable_state":"dirty"}' "$gate_green"
  bc_check mergeable-review-gate-red 1 '{"mergeable":true,"mergeable_state":"blocked"}' "$gate_red"
  mv_check empty-fetch unknown ''
  eval "$real_fetch"

  # REST payloads reach the same verdicts (MYK9-1414): lower-case enums, a
  # status context's state, and the draft->ready stale rule, which only works
  # when workflowName is joined from the run id.
  rest() { # rest <label> <expected> <check-runs> <statuses>
    got=$(verdict "$(rest_rollup "$3" "$4" "$rest_runs")" "$req")
    [ "$got" = "$2" ] || { echo "SELF-TEST FAIL [rest-$1]: expected '$2', got '$got'"; ok=1; }
  }
  run_() { # run_ <name> <status> <conclusion|null> <run> <job>
    printf '{"name":"%s","status":"%s","conclusion":%s,"started_at":"2026-10-25T19:00:00Z","details_url":"https://github.com/o/r/actions/runs/%s/job/%s"}' "$1" "$2" "$3" "$4" "$5"
  }
  rest failure 'required-failed:Test' "[$(run_ 'Quality Checks' completed '"success"' 100 1),$(run_ Test completed '"failure"' 100 2)]" '[]'
  rest status-failure 'preview-failed:Vercel - app' "[$(run_ 'Quality Checks' completed '"success"' 100 1),$(run_ Test completed '"skipped"' 100 2)]" '[{"context":"Vercel - app","state":"failure","created_at":"2026-10-25T19:00:00Z"}]'
  rest stale-skip 'waiting:Quality Checks, Test' "[$(run_ 'Quality Checks' completed '"skipped"' 100 1),$(run_ Test completed '"skipped"' 100 2),$(run_ 'Quality Checks' in_progress null 200 3)]" '[]'
  rest green 'green' "[$(run_ 'Quality Checks' completed '"success"' 100 1),$(run_ Test completed '"success"' 100 2)]" '[{"context":"Vercel - app","state":"pending","created_at":"2026-10-25T19:00:00Z"}]'
  return "$ok"
}

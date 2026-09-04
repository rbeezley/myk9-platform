#!/usr/bin/env bash
#
# Decide whether a CI run on `main` is safe to promote to the staging release
# refs, by looking at its JOBS rather than at the run's rollup conclusion.
#
# ## Why this exists
#
# `deploy-staging.yml` used to gate on `workflow_run.conclusion == 'success'`.
# That conclusion is an AND over every job in the run, including
# `Test myK9Show (coverage)` -- a push-only, informational, non-gating report
# that runs the whole unsharded suite and therefore runs long. When merges land
# close together, CI's concurrency group cancels that job on the older run, the
# run's conclusion becomes `cancelled`, and promotion is skipped even though
# every gating job passed.
#
# Observed 2026-09-04: three consecutive merges (f7876cd6a, 68a0bd813,
# ad060903c) produced `cancelled` runs and the release refs stayed pinned to
# 6d7a2db9a. On ad060903c (run 33888054791) all fourteen jobs were `success`
# except that one informational job.
#
# ## The rule
#
# A run is promotable when BOTH hold:
#
#   1. Every REQUIRED job is present and `success`. This is a floor: it stops a
#      run in which the gating jobs never ran (or were renamed away) from
#      promoting on a technicality. Its absence fails LOUD -- promotion stops --
#      which is the safe direction for a deploy gate.
#
#   2. Every job NOT on the INFORMATIONAL list concluded `success` or `skipped`.
#      A new gating job is therefore covered automatically, with no list to
#      update. A new INFORMATIONAL job blocks promotion until someone adds it
#      here -- again, loud rather than silent.
#
# `skipped` is allowed in (2) because several jobs skip legitimately:
# `Smoke build`, `A11y smoke` and `E2E PR Smoke` are gated on
# `MYK9SHOW_SMOKE_CI_ENABLED` and on `smoke-scope`. It is NOT a hole, because a
# job that skips as a CONSEQUENCE of failure -- `Build` skips when `Test` fails
# -- is caught by rule (1) via the job that actually failed. Verified against run
# 33832052383, where `Test packages` failed and `Build`, `Smoke build`,
# `A11y smoke` and `E2E PR Smoke` were all skipped.
#
# `cancelled` is NOT allowed. A genuinely superseded run has gating jobs
# cancelled mid-flight (run 33886627564 had `A11y smoke` and `E2E PR Smoke`
# cancelled), and a half-run smoke suite is not evidence.
#
# ## Usage
#
#   gh api "repos/$REPO/actions/runs/$RUN_ID/jobs?per_page=100" \
#     | scripts/ci/evaluate-gating-jobs.sh
#
# Exit 0 = promotable. Exit 1 = not promotable, reasons on stderr.
# Exit 2 = the input could not be trusted (malformed, truncated, partial).

set -euo pipefail

# Outcome ignored entirely. Keep this list as short as it can possibly be --
# every entry is a job that can be broken without blocking a deploy.
INFORMATIONAL_JOBS='[
  "Test myK9Show (coverage)"
]'

# Must each be present AND `success`. Deliberately the aggregators rather than
# every leaf: `Test` already `needs` the four test jobs and fails if any of them
# did, so listing the leaves here would add churn without adding coverage.
REQUIRED_JOBS='[
  "Quality Checks",
  "Test",
  "Build"
]'

# A run with implausibly few jobs is not a pass -- it is a response we should
# not act on. The workflow currently has 14 jobs; this floor only catches
# truncation and empty responses, so it needs no maintenance alongside the
# job lists above.
MIN_JOBS=8

payload="$(cat)"

if ! jq -e 'type == "object" and (.jobs | type == "array")' >/dev/null 2>&1 <<<"$payload"; then
  echo "evaluate-gating-jobs: input is not a jobs payload" >&2
  exit 2
fi

job_count="$(jq '.jobs | length' <<<"$payload")"
if (( job_count < MIN_JOBS )); then
  echo "evaluate-gating-jobs: only $job_count jobs in the payload (expected at least $MIN_JOBS) -- refusing to treat this as a verdict" >&2
  exit 2
fi

# `total_count` is the server's own count. If it exceeds what we were handed,
# the response was paginated and we are reasoning about a subset.
total_count="$(jq '.total_count // (.jobs | length)' <<<"$payload")"
if (( total_count > job_count )); then
  echo "evaluate-gating-jobs: payload holds $job_count of $total_count jobs -- raise per_page rather than deciding on a subset" >&2
  exit 2
fi

# Emits {examined, problems} rather than a bare problem list, and the count is
# asserted below. That is not decoration.
#
# The first version of this script omitted `<<<"$payload"` on this very call.
# `payload="$(cat)"` had already drained stdin, so jq evaluated an EMPTY input,
# found no problems, and the script reported PROMOTABLE for run 33832052383 --
# in which `Test packages` had FAILED. It failed OPEN, on a deploy gate, and
# looked perfectly healthy doing it. Only running it against recorded real runs
# caught it.
#
# So an empty problem list is trusted only when the filter also reports that it
# examined every job we handed it. Absence of evidence is not evidence here.
verdict="$(
  jq -c \
    --argjson informational "$INFORMATIONAL_JOBS" \
    --argjson required "$REQUIRED_JOBS" \
    '
    (.jobs | map({name, conclusion})) as $jobs
    | {
        examined: ($jobs | length),
        problems: (
          (
            ($required | map(
              . as $name
              | ($jobs | map(select(.name == $name)) | first) as $job
              | if $job == null then "required job \($name) is missing from the run"
                elif $job.conclusion != "success" then "required job \($name) concluded \($job.conclusion // "null")"
                else empty end
            ))
            +
            ($jobs | map(
              select((.name | IN($informational[])) | not)
              | select((.conclusion // "null") != "success" and (.conclusion // "null") != "skipped")
              | "job \(.name) concluded \(.conclusion // "null")"
            ))
          ) | unique
        )
      }
    ' <<<"$payload"
)"

examined="$(jq -r '.examined' <<<"$verdict")"
if [[ "$examined" != "$job_count" ]]; then
  echo "evaluate-gating-jobs: examined $examined of $job_count jobs -- refusing to decide on a partial evaluation" >&2
  exit 2
fi

problems="$(jq -r '.problems[]' <<<"$verdict")"

if [[ -n "$problems" ]]; then
  echo "evaluate-gating-jobs: run is NOT promotable" >&2
  while IFS= read -r line; do
    [[ -n "$line" ]] && echo "  - $line" >&2
  done <<<"$problems"
  exit 1
fi

ignored="$(
  jq -r --argjson informational "$INFORMATIONAL_JOBS" \
    '.jobs
     | map(select((.name | IN($informational[])) and (.conclusion // "null") != "success"))
     | map("\(.name) (\(.conclusion // "null"))")
     | join(", ")' <<<"$payload"
)"

echo "evaluate-gating-jobs: run is promotable -- $examined jobs examined"
if [[ -n "$ignored" ]]; then
  echo "evaluate-gating-jobs: ignored non-gating job outcome(s): $ignored"
fi
exit 0

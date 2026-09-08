#!/usr/bin/env bash
# Run the Codex review gate the only way it is safe to run it.
#
# `codex review` exits 0 when it never reviewed anything: a usage-limit abort
# prints "ERROR: You've hit your usage limit" and "Review was interrupted" and
# returns success, so a backgrounded run reports "completed (exit code 0)" and
# the gate reads as passed on a PR nothing looked at (CLAUDE.md LESSONS,
# 2026-08-23, PR #1770). And `--commit <sha>` reviews ONE commit, so on a
# multi-commit branch it can land on a docs-only commit and vacuously pass.
#
# This wrapper always reviews the whole branch against the base, closes stdin
# (an open stdin hangs the CLI), writes the full log to a file, and exits
# NON-ZERO when the review did not run — the grep is anchored to line start
# because the log echoes the diff, and a diff that mentions those phrases
# (this file does) matched an unanchored grep on 2026-09-05. It ends by printing
# the exact evidence line `scripts/qa/review-gate.ts` accepts, but only when the
# verdict is clean; with findings it prints them and tells you to re-run.
#
# With --post it also WRITES to the PR: findings go up as a `Codex findings for
# <head>` comment (never evidence — it does not begin `Review gate:`), and a
# clean verdict is posted by scripts/qa/post-review-gate.sh, the only writer of
# evidence comments. Nobody types an evidence line by hand.
#
# Usage: scripts/qa/codex-review.sh [base-ref] [--post]   (default: origin/main)
#        pnpm qa:codex-review --post                      (no `--`: see the parser)
# Env:   CODEX_BIN  override the codex executable (tests use a stub)
#        GH_BIN     override the gh executable (tests use a stub)
# Exit:  0 review ran and found nothing actionable
#        1 review ran and reported findings (fix, re-run against the new head)
#        2 review did NOT complete (usage limit, interrupted, cli failure, or
#          unrecognized output) — not a verdict, never post evidence
set -uo pipefail

# `--post` is a flag, not a base ref, and pnpm forwards a bare `--` to the
# script — `pnpm qa:codex-review -- --post` would otherwise review base `--`
# and die in `git rev-parse`. Parse instead of indexing $1.
BASE_REF="origin/main"
for arg in "$@"; do
  case "$arg" in --post | --) ;; *) BASE_REF="$arg" ;; esac
done
POST=0
for arg in "$@"; do [ "$arg" = "--post" ] && POST=1; done
GH="${GH_BIN:-gh}"
HERE="$(cd "$(dirname "$0")" && pwd)"
POSTER="$HERE/post-review-gate.sh"
# One definition of "clean verdict" for both wrappers and the poster.
# shellcheck source=scripts/qa/review-verdict.sh
. "$HERE/review-verdict.sh"
CODEX="${CODEX_BIN:-codex}"
BASE_SHA="$(git rev-parse "$BASE_REF")"
HEAD_SHA="$(git rev-parse HEAD)"
LOG="${CODEX_REVIEW_LOG:-/tmp/codex-review-${HEAD_SHA}.log}"

# --base and a positional review prompt are mutually exclusive in the CLI.
# Supply the verdict contract as session-only developer instructions instead;
# never infer success from a summary of changes or passing tests (MYK9-416).
# This overrides developer_instructions for this review, not the user's config
# file, and leaves the built-in review prompt and repository instructions intact.
REVIEW_INSTRUCTIONS='Review verdict contract: Only assert a clean verdict after completing the requested whole-branch review and finding no actionable defects. In that case, begin the final verdict with exactly: No actionable defects found. Put any summary or validation details after that sentence. If there are actionable findings, report each as a bullet beginning with - [P0], - [P1], - [P2], or - [P3], as appropriate; do not emit a clean assertion. If the review cannot be completed, begin with: Unable to complete the review. Explain the blocker and do not emit a clean assertion. Passing tests or a change summary alone is not a review verdict.'

echo "codex-review: ${BASE_REF} (${BASE_SHA:0:9}) .. HEAD (${HEAD_SHA:0:9}) -> ${LOG}"
"$CODEX" review --base "$BASE_REF" -c "developer_instructions=\"${REVIEW_INSTRUCTIONS}\"" < /dev/null > "$LOG" 2>&1
CLI_EXIT=$?

abort_lines() {
  grep -E "^(ERROR: You've hit your usage limit|Review was interrupted)" "$LOG"
}

# The verdict is everything after the CLI's own "codex" marker line.
VERDICT="$(review_last_block "$LOG")"
if [ -z "$VERDICT" ]; then
  if abort_lines > /dev/null; then
    echo "codex-review: GATE DID NOT RUN (usage limit or interrupted; cli exit ${CLI_EXIT}). This is not a verdict."
    abort_lines | head -3
    exit 2
  fi
  echo "codex-review: no verdict block found in the log (cli exit ${CLI_EXIT}); treat as not run."
  tail -5 "$LOG"
  exit 2
fi

# FINDINGS ARE PROCESSED BEFORE EVERY INCOMPLETENESS GUARD. A review that
# reported a defect and then hit a blocker has still reported a defect, and
# exiting 2 here would leave an already-green gate green over it (Codex review
# of #2115, round 5). It also removes a false abort of the wrapper's own
# making: the log echoes commands the reviewer ran, and on round 5 a reproduction
# printed this wrapper's own "Review was interrupted" line at column 0, which
# the anchored grep read as a real abort and threw away a completed review.

echo "$VERDICT"
if review_text_matches "$REVIEW_FINDING_BULLET" "$VERDICT"; then
  echo
  echo "codex-review: findings above. Fix them, commit, and re-run — the evidence line is for the NEW head."
  # Findings belong ON the PR: without this they existed only in a local log,
  # and the PR carried nothing but "12 findings, all addressed". This comment
  # never begins with `Review gate:`, so review-gate.ts never reads it as
  # evidence — and the clean re-run counts its [P*] bullets for the N.
  if [ "$POST" = 1 ]; then
    PR="$("$GH" pr view --json number -q .number)"
    # A lost findings comment is not a cosmetic failure: the next clean run
    # counts N from these comments, so a silently dropped one makes the
    # evidence read "no findings" for a head that had them (Codex, #2115 P2).
    if ! "$GH" pr comment "$PR" --body "$(printf 'Codex findings for %s (not gate evidence):\n\n%s\n' "${HEAD_SHA:0:9}" "$VERDICT")"; then
      echo "codex-review: findings were NOT posted (gh failed). Exit 2; nothing recorded — re-run once gh works." >&2
      exit 2
    fi
    # If this head already carries clean evidence, the findings comment alone
    # leaves the gate GREEN — review-gate.ts only reads `Review gate:` lines,
    # and the old clean one is still the latest (Codex review of #2115, round
    # 3). Withdraw it with an evidence line the checker rejects.
    FOUND="$(echo "$VERDICT" | grep -cE "$REVIEW_FINDING_BULLET" || true)"
    if ! bash "$POSTER" --withdraw "$PR" codex "$BASE_SHA" "$HEAD_SHA" "${FOUND} findings, not addressed" "$LOG"; then
      echo "codex-review: findings posted, but the earlier clean evidence for this head could NOT be withdrawn. Exit 2 — check the gate status by hand." >&2
      exit 2
    fi
  fi
  exit 1
fi

# No findings — now the incompleteness guards decide, and they are strict:
# nothing below may certify a review that did not finish.
if abort_lines > /dev/null; then
  echo "codex-review: GATE DID NOT RUN (usage limit or interrupted; cli exit ${CLI_EXIT}). This is not a verdict."
  abort_lines | head -3
  exit 2
fi

# Clean is a POSITIVE match, never the absence of findings: a verdict block
# that says "Unable to complete the review" has no [P*] bullets either, and the
# first version of this wrapper certified exactly that as clean (Codex review
# of #2063, P1). The CLI must also have exited 0 — a non-zero exit with any
# text is a failed run, not a verdict.
if [ "$CLI_EXIT" -ne 0 ]; then
  echo
  echo "codex-review: cli exited ${CLI_EXIT}; treating the run as NOT completed (exit 2). No evidence emitted."
  exit 2
fi
# An incomplete review overrides a clean assertion. Scope this to the review:
# tests that did not run or interrupted downloads do not invalidate a review.
# Scan only the verdict, not the CLI's source/diff echo.
if review_text_imatches '\breview[[:space:]]+(did not run|was interrupted|interrupted)\b' "$VERDICT"; then
  echo
  echo "codex-review: GATE DID NOT RUN (verdict reports an incomplete review). No evidence emitted."
  exit 2
fi

# Only the first non-empty paragraph can certify the review (MYK9-415), and it
# must carry a whole clean-verdict SENTENCE, not just its opening. That rule
# lives in scripts/qa/review-verdict.sh, shared with the poster and the Claude
# wrapper — see its header for why the sentence is not anchored to the start of
# the block (#2074 opened with a summary and a block-anchored match rejected a
# review that had genuinely run).
if ! review_verdict_is_clean "$VERDICT"; then
  echo
  echo "codex-review: verdict is neither findings nor an explicit clean verdict — unrecognized output, treat as not run (exit 2). No evidence emitted."
  exit 2
fi

VERDICT_LINE="no findings"
if [ "$POST" = 1 ]; then
  PR="$("$GH" pr view --json number -q .number)"
  # N comes from the wrapper's OWN earlier findings comments on this PR, so
  # "N findings, all addressed" is counted from what was posted, not typed.
  # Fail closed: a transient API failure here returns an empty history, which
  # would post "no findings" over a head that had them (Codex, #2115 round 2).
  if ! PRIOR="$("$GH" pr view "$PR" --json comments -q '[.comments[].body | select(startswith("Codex findings for"))] | join("\n")')"; then
    echo "codex-review: could not read this PR's earlier findings comments (gh failed), so N cannot be trusted. Exit 2; no evidence posted." >&2
    exit 2
  fi
  N="$(printf '%s' "$PRIOR" | grep -cE "$REVIEW_FINDING_BULLET" || true)"
  [ "${N:-0}" -gt 0 ] && VERDICT_LINE="$N findings, all addressed"
  # The wrapper runs without errexit; a poster failure (grammar refusal, gh
  # error) must not fall through to exit 0 as if evidence had been posted.
  if ! bash "$POSTER" "$PR" codex "$BASE_SHA" "$HEAD_SHA" "$VERDICT_LINE" "$LOG"; then
    echo "codex-review: review was clean but the evidence was NOT posted (poster failed). Exit 2; nothing recorded." >&2
    exit 2
  fi
else
  echo
  echo "codex-review: clean. Do NOT type the evidence by hand — re-run with --post, or:"
  echo "  bash scripts/qa/post-review-gate.sh <pr> codex ${BASE_SHA:0:9} ${HEAD_SHA:0:9} \"$VERDICT_LINE\" $LOG"
  # The line the poster will write, printed so a human can see what is claimed.
  echo "Review gate: codex reviewed ${BASE_SHA:0:9}..${HEAD_SHA:0:9} — no findings"
fi
exit 0

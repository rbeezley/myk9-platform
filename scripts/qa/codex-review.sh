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
# This wrapper reviews the whole branch against the base (round 2 and later of
# a --post gate narrow to the fix range; see MYK9-1590 below), closes stdin
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
#        Check `pnpm qa:review-tier --base origin/main` FIRST — a cross-harness
#        review is only required when the printed tier is `independent`.
# Env:   CODEX_BIN          override the codex executable (tests use a stub)
#        GH_BIN             override the gh executable (tests use a stub)
#        CODEX_REVIEW_MODEL run the review on this model instead of the
#          config default. A cheaper model (e.g. gpt-6-luna) is for re-checks,
#          never the gate: when set, the wrapper refuses --post and prints no
#          evidence line.
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
MODEL="${CODEX_REVIEW_MODEL:-}"
MODEL_ARGS=()
if [ -n "$MODEL" ]; then
  # Interpolated into a TOML string below — reject anything that could break
  # out of the quoted value.
  case "$MODEL" in
  *[!A-Za-z0-9._-]*)
    echo "codex-review: CODEX_REVIEW_MODEL \"$MODEL\" is not a valid model slug (allowed: A-Za-z0-9._-). Exit 2." >&2
    exit 2
    ;;
  esac
  if [ "$POST" = 1 ]; then
    echo "codex-review: CODEX_REVIEW_MODEL is for re-checks, not the gate. Refusing --post. Exit 2." >&2
    exit 2
  fi
  MODEL_ARGS=(-c "model=\"${MODEL}\"")
fi
BASE_SHA="$(git rev-parse "$BASE_REF")"
HEAD_SHA="$(git rev-parse HEAD)"
LOG="${CODEX_REVIEW_LOG:-/tmp/codex-review-${HEAD_SHA}.log}"

# --base and a positional review prompt are mutually exclusive in the CLI.
# Supply the verdict contract as session-only developer instructions instead;
# never infer success from a summary of changes or passing tests (MYK9-416).
# This overrides developer_instructions for this review, not the user's config
# file, and leaves the built-in review prompt and repository instructions intact.
REVIEW_INSTRUCTIONS='Review verdict contract: Only assert a clean verdict after completing the requested whole-branch review and finding no actionable defects. In that case, begin the final verdict with exactly: No actionable defects found. Put any summary or validation details after that sentence. If there are actionable findings, report each as a bullet beginning with - [P0], - [P1], - [P2], or - [P3], as appropriate; do not emit a clean assertion. If the review cannot be completed, begin with: Unable to complete the review. Explain the blocker and do not emit a clean assertion. Passing tests or a change summary alone is not a review verdict. Report every actionable finding in the whole diff on this pass, ordered by severity with P0 first, rather than stopping after the first few, so a later round only confirms the fixes. Bug classes: when a finding is one instance of a pattern, name the pattern and list every instance in the diff inside that one finding, so later rounds do not find them one at a time. Origin: a defect is pre-existing only when the same defective code exists unchanged at the base commit, in lines this branch did not add or modify, and the branch does not make it more severe; cite its location. Anything in lines the branch added or changed, or any regression the branch causes, is a normal finding, and when unsure it is a normal finding. Pre-existing defects are not actionable for this branch and do not prevent a clean verdict: list them after the verdict under the heading Pre-existing defects, each as a bullet beginning with - [pre-existing P0], - [pre-existing P1], - [pre-existing P2], or - [pre-existing P3], never as a normal finding bullet. Likelihood: state the realistic trigger of each finding (who does what, how often) in one clause. A finding that needs improbable timing (a disconnect inside one request, a race within one render) or a hand-crafted input is P3 at most, unless its outcome is lost or corrupted show-day data (scores, check-ins, entries, money) or a security or privacy exposure. Report such a capped finding after the verdict under the heading Not actionable this round, as a bullet beginning with - [unlikely P3], never as a normal finding bullet.'
# The Likelihood sentence (owner, 2026-10-31) is part of the one contract, so
# claude-review.sh and the adversarial lenses get it too (scripts/qa/review-contract.sh,
# MYK9-1613): rounds were spent fixing failures that realistically never happen.

# Round 2 and later (MYK9-1590): re-reading the whole branch every round
# surfaced fresh minor findings in code that had already passed, so PRs rarely
# converged inside the 3-round cap. The anchor is this wrapper's own latest
# `Codex findings for <head>` comment, from a trusted author (an outsider's
# comment on this public repo must never narrow a review), and only when its
# line 2 records that the review COMPLETED from the branch's fork point or
# earlier: a review that reported findings and then aborted, or one run
# against a narrower base, never covered the range it would let us skip.
# Then only <head>..HEAD is reviewed, and P0/P1 anywhere still block. A
# missing, rebased or same head, or a merge in the range, falls back to the
# whole branch. The evidence line still certifies BASE..HEAD.
REVIEW_BASE="$BASE_REF"
COVERED_FROM="$(git merge-base "$BASE_SHA" HEAD)"
ANCHOR_JQ='[.comments[] | select(.authorAssociation == "OWNER" or .authorAssociation == "MEMBER" or .authorAssociation == "COLLABORATOR") | select(.body | startswith("Codex findings for")) | .body] | last // ""'
if [ "$POST" = 1 ] && PR="$("$GH" pr view --json number -q .number 2>/dev/null)" && [ -n "$PR" ] &&
  ANCHOR="$("$GH" pr view "$PR" --json comments -q "$ANCHOR_JQ" 2>/dev/null)"; then
  LAST="$(printf '%s\n' "$ANCHOR" | sed -nE '1s/^Codex findings for ([0-9a-f]{7,40}) .*/\1/p')"
  FROM="$(printf '%s\n' "$ANCHOR" | sed -nE '2s/^Coverage: complete from ([0-9a-f]{7,40})$/\1/p')"
  if [ -n "$LAST" ] && [ -n "$FROM" ] &&
    LAST_SHA="$(git rev-parse --verify -q "${LAST}^{commit}")" &&
    FROM_SHA="$(git rev-parse --verify -q "${FROM}^{commit}")" &&
    git merge-base --is-ancestor "$FROM_SHA" "$COVERED_FROM" &&
    [ "$LAST_SHA" != "$HEAD_SHA" ] && git merge-base --is-ancestor "$LAST_SHA" HEAD &&
    [ -z "$(git rev-list --merges "${LAST_SHA}..HEAD")" ]; then
    REVIEW_BASE="$LAST_SHA"
    COVERED_FROM="$FROM_SHA"
    REVIEW_INSTRUCTIONS="${REVIEW_INSTRUCTIONS/requested whole-branch review/requested fix-range review} Fix-range round: earlier rounds of this review already read ${BASE_SHA:0:9}..${LAST_SHA:0:9}; this round reviews ${LAST_SHA:0:9}..${HEAD_SHA:0:9}. Report as normal findings only (a) defects those commits introduce, including regressions they cause elsewhere, and (b) any P0 or P1 anywhere in the branch ${BASE_SHA:0:9}..${HEAD_SHA:0:9}. A P2 or P3 in code the earlier rounds already read is not actionable this round: list it after the verdict under the heading Not actionable this round, as a bullet beginning with - [earlier-round P2] or - [earlier-round P3]."
    echo "codex-review: round 2+ — fix range ${LAST_SHA:0:9}..${HEAD_SHA:0:9} (last completed codex review on PR #${PR})"
  fi
fi

echo "codex-review: ${REVIEW_BASE} (${BASE_SHA:0:9}) .. HEAD (${HEAD_SHA:0:9}) -> ${LOG} (model ${MODEL:-config default})"
"$CODEX" review --base "$REVIEW_BASE" ${MODEL_ARGS[@]+"${MODEL_ARGS[@]}"} -c "developer_instructions=\"${REVIEW_INSTRUCTIONS}\"" < /dev/null > "$LOG" 2>&1
CLI_EXIT=$?

abort_lines() {
  grep -E "^(ERROR: You've hit your usage limit|Review was interrupted)" "$LOG"
}

# 0 only when the review FINISHED: the CLI exited 0, printed no abort line, and
# the verdict reports neither an incomplete review nor an inability to do one.
# A findings verdict can say "Unable to complete the review" and still list a
# defect, and its coverage claim would let the next round skip what it never
# read (MYK9-1590, Codex round 2).
review_finished() {
  [ "$CLI_EXIT" -eq 0 ] && ! abort_lines > /dev/null &&
    ! review_text_imatches '\breview[[:space:]]+(did not run|was interrupted|interrupted)\b|unable to complete the review' "$VERDICT"
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
review_note_preexisting codex-review "$VERDICT"
review_note_not_this_round codex-review "$VERDICT"
if review_has_findings "$VERDICT"; then
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
    # Line 2 is the round-2 anchor's coverage claim (MYK9-1590): written only
    # when this review finished, so an aborted one can never narrow the next.
    COVERAGE=""
    if review_finished; then COVERAGE="Coverage: complete from ${COVERED_FROM:0:9}"; fi
    if ! "$GH" pr comment "$PR" --body "$(printf 'Codex findings for %s (not gate evidence):\n%s\n\n%s\n' "${HEAD_SHA:0:9}" "$COVERAGE" "$VERDICT")"; then
      echo "codex-review: findings were NOT posted (gh failed). Exit 2; nothing recorded — re-run once gh works." >&2
      exit 2
    fi
    # If this head already carries clean evidence, the findings comment alone
    # leaves the gate GREEN — review-gate.ts only reads `Review gate:` lines,
    # and the old clean one is still the latest (Codex review of #2115, round
    # 3). Withdraw it with an evidence line the checker rejects.
    FOUND="$(review_finding_count "$VERDICT")"
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
  N="$(review_finding_count "$PRIOR")"
  [ "${N:-0}" -gt 0 ] && VERDICT_LINE="$N findings, all addressed"
  # The wrapper runs without errexit; a poster failure (grammar refusal, gh
  # error) must not fall through to exit 0 as if evidence had been posted.
  if ! bash "$POSTER" "$PR" codex "$BASE_SHA" "$HEAD_SHA" "$VERDICT_LINE" "$LOG"; then
    echo "codex-review: review was clean but the evidence was NOT posted (poster failed). Exit 2; nothing recorded." >&2
    exit 2
  fi
elif [ -n "$MODEL" ]; then
  echo
  echo "codex-review: clean on ${MODEL}. This is a re-check, not gate evidence — run the gate without CODEX_REVIEW_MODEL."
else
  echo
  echo "codex-review: clean. Do NOT type the evidence by hand — re-run with --post, or:"
  echo "  bash scripts/qa/post-review-gate.sh <pr> codex ${BASE_SHA:0:9} ${HEAD_SHA:0:9} \"$VERDICT_LINE\" $LOG"
  # The line the poster will write, printed so a human can see what is claimed.
  echo "Review gate: codex reviewed ${BASE_SHA:0:9}..${HEAD_SHA:0:9} — no findings"
fi
exit 0

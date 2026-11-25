#!/usr/bin/env bash
# Run the agy (Antigravity CLI) review gate the only way it is safe to run it.
# This is the agy twin of scripts/qa/codex-review.sh, with the same arguments,
# round logic, log location and post path (MYK9-2326); only the reviewer
# invocation and the reading of its output differ.
#
# `agy -p` exits 0 on EVERYTHING: a print timeout, a refused shell command
# (headless agy auto-denies anything off the allow list and one denial ends the
# run), a crash that left nothing, a half-written answer. So the exit code is
# never the verdict. "Did not run" is decided from the OUTPUT: empty or
# whitespace-only, a refusal/timeout/error line at column 0, an unbalanced code
# fence (truncated mid-block), or no explicit clean verdict and no findings.
#
# The review is read-only: --mode plan plus a session-only allow list of
# read-only commands (--settings is never saved, and never
# --dangerously-skip-permissions). The prompt is the checked-in
# scripts/qa/agy-review-prompt.md ({DIFF}, {NEWEST}) followed by the shared
# verdict contract (scripts/qa/review-contract.sh), so the verdict grammar is
# the one every other reviewer is judged by.
#
# With --post, findings go up as an `Agy findings for <head>` comment (never
# evidence: it does not begin `Review gate:`) and a clean verdict is posted by
# scripts/qa/post-review-gate.sh, the only writer of evidence comments.
#
# Usage: scripts/qa/agy-review.sh [base-ref] [--post]   (default: origin/main)
#        pnpm qa:agy-review --post
#        Check `pnpm qa:review-tier --base origin/main` FIRST: a cross-harness
#        review is only required when the printed tier is `independent`.
#        An agy run takes 3-8 minutes and prints nothing until it finishes;
#        run it in the background, never under `timeout`.
# Env:   AGY_BIN             override the agy executable (tests use a stub)
#        GH_BIN              override the gh executable (tests use a stub)
#        AGY_REVIEW_LOG      override the log path
#        AGY_REVIEW_TIMEOUT  agy --print-timeout (default 20m)
# Exit:  0 review ran and found nothing actionable
#        1 review ran and reported findings (fix, re-run against the new head)
#        2 review did NOT complete (timeout, refused command, empty or
#          truncated output, cli failure, unrecognized output): not a verdict,
#          never post evidence
set -uo pipefail

BASE_REF="origin/main"
for arg in "$@"; do
  case "$arg" in --post | --) ;; *) BASE_REF="$arg" ;; esac
done
POST=0
for arg in "$@"; do [ "$arg" = "--post" ] && POST=1; done
GH="${GH_BIN:-gh}"
AGY="${AGY_BIN:-agy}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(git rev-parse --show-toplevel)"
POSTER="$HERE/post-review-gate.sh"
# shellcheck source=scripts/qa/review-verdict.sh
. "$HERE/review-verdict.sh"

BASE_SHA="$(git rev-parse "$BASE_REF")" || exit 2
HEAD_SHA="$(git rev-parse HEAD)"
mkdir -p "$ROOT/.logs"
LOG="${AGY_REVIEW_LOG:-$ROOT/.logs/agy-review-${HEAD_SHA}.log}"

PROMPT_TEMPLATE="$HERE/agy-review-prompt.md"
CONTRACT="$(bash "$HERE/review-contract.sh" 2>/dev/null)"
if [ -z "$CONTRACT" ] || [ ! -s "$PROMPT_TEMPLATE" ]; then
  echo "agy-review: could not read the verdict contract or ${PROMPT_TEMPLATE}; refusing to review without them (exit 2)." >&2
  exit 2
fi

# Round 2 and later: same anchor rule as codex-review.sh (MYK9-1590/1603), on
# this wrapper's own `Agy findings for <head>` comments and its clean
# `Review gate: agy reviewed` lines, trusted authors only.
REVIEW_BASE="$BASE_REF"
COVERED_FROM="$(git merge-base "$BASE_SHA" HEAD)"
FIX_RANGE=0
END_MARKER="END OF REVIEW"
ANCHOR_JQ='[.comments[] | select(.authorAssociation == "OWNER" or .authorAssociation == "MEMBER" or .authorAssociation == "COLLABORATOR") | select(.body | split("\n") as $l | ($l[0] | startswith("Agy findings for")) or (($l[0] | test("^Review gate: agy reviewed [0-9a-f]{7,40}\\.\\.[0-9a-f]{7,40} — ")) and (($l[1] // "") | startswith("Coverage: complete from ")))) | .body] | last // ""'
if [ "$POST" = 1 ] && PR="$("$GH" pr view --json number -q .number 2>/dev/null)" && [ -n "$PR" ] &&
  ANCHOR="$("$GH" pr view "$PR" --json comments -q "$ANCHOR_JQ" 2>/dev/null)"; then
  LAST="$(printf '%s\n' "$ANCHOR" | sed -nE '1s/^Agy findings for ([0-9a-f]{7,40}) .*/\1/p')"
  ANCHOR_OK=1
  if [ -z "$LAST" ]; then
    LAST="$(printf '%s\n' "$ANCHOR" | sed -nE '1s/^Review gate: agy reviewed [0-9a-f]{7,40}\.\.([0-9a-f]{7,40}) — .*/\1/p')"
    ANCHOR_VERDICT="$(printf '%s\n' "$ANCHOR" | sed -nE '1s/^Review gate: agy reviewed [0-9a-f]{7,40}\.\.[0-9a-f]{7,40} — (.*)$/\1/p')"
    node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
      "$HERE/review-gate.ts" --reviewer agy --verdict "$ANCHOR_VERDICT" || ANCHOR_OK=0
  fi
  FROM="$(printf '%s\n' "$ANCHOR" | sed -nE '2s/^Coverage: complete from ([0-9a-f]{7,40})$/\1/p')"
  if [ "$ANCHOR_OK" = 1 ] && [ -n "$LAST" ] && [ -n "$FROM" ] &&
    LAST_SHA="$(git rev-parse --verify -q "${LAST}^{commit}")" &&
    FROM_SHA="$(git rev-parse --verify -q "${FROM}^{commit}")" &&
    git merge-base --is-ancestor "$FROM_SHA" "$COVERED_FROM" &&
    [ "$LAST_SHA" != "$HEAD_SHA" ] && git merge-base --is-ancestor "$LAST_SHA" HEAD &&
    [ -z "$(git rev-list --merges "${LAST_SHA}..HEAD")" ]; then
    REVIEW_BASE="$LAST_SHA"
    COVERED_FROM="$FROM_SHA"
    FIX_RANGE=1
    echo "agy-review: round 2+ — fix range ${LAST_SHA:0:9}..${HEAD_SHA:0:9} (last completed agy review on PR #${PR})"
  fi
fi

# The branch diff is always the full BASE..HEAD (the prompt's {DIFF}); a fix
# range adds the newest commits alone ({NEWEST}) and the round-2 rule.
DIFF_FILE="$ROOT/.logs/agy-review-${HEAD_SHA:0:9}.diff"
NEWEST_FILE="$ROOT/.logs/agy-review-newest-${HEAD_SHA:0:9}.diff"
git diff "$BASE_SHA...HEAD" > "$DIFF_FILE"
if [ ! -s "$DIFF_FILE" ]; then
  echo "agy-review: the diff ${BASE_REF}...HEAD is empty, nothing to review (exit 2). No evidence emitted." >&2
  exit 2
fi
BT='`'
NEWEST_TEXT=""
if [ "$FIX_RANGE" = 1 ]; then
  git diff "${REVIEW_BASE}..HEAD" > "$NEWEST_FILE"
  NEWEST_TEXT="The newest commits alone, which answer findings from an earlier review round, are in ${BT}.logs/agy-review-newest-${HEAD_SHA:0:9}.diff${BT}; give them the most attention."
  CONTRACT="${CONTRACT/requested whole-branch review/requested fix-range review} Fix-range round: earlier rounds of this review already read ${BASE_SHA:0:9}..${REVIEW_BASE:0:9}; this round reviews ${REVIEW_BASE:0:9}..${HEAD_SHA:0:9}. Report as normal findings only (a) defects those commits introduce, including regressions they cause elsewhere, and (b) any P0 or P1 anywhere in the branch ${BASE_SHA:0:9}..${HEAD_SHA:0:9}. A P2 or P3 in code the earlier rounds already read is not actionable this round: list it after the verdict under the heading Not actionable this round, as a bullet beginning with - [earlier-round P2] or - [earlier-round P3]."
fi
PROMPT="$(cat "$PROMPT_TEMPLATE")"
PROMPT="${PROMPT//\{DIFF\}/${BT}.logs/agy-review-${HEAD_SHA:0:9}.diff${BT}}"
PROMPT="${PROMPT//\{NEWEST\}/$NEWEST_TEXT}"
PROMPT="$(printf '%s\n\n## Verdict format (overrides the Output section above)\n\n%s\n\nThe LAST line of your answer must be exactly: %s\nPut nothing after it. An answer without that final line is treated as cut off and discarded.\n' "$PROMPT" "$CONTRACT" "$END_MARKER")"

echo "agy-review: ${REVIEW_BASE} (${BASE_SHA:0:9}) .. HEAD (${HEAD_SHA:0:9}) -> ${LOG}"
# Flags BEFORE -p (agy takes the prompt as -p's value). Read-only: plan mode and
# an allow list with no sed (sed -i writes). stdin is closed.
cd "$ROOT" || exit 2
"$AGY" --mode plan --print-timeout "${AGY_REVIEW_TIMEOUT:-20m}" \
  --settings '{"permissions":{"allow":["command(grep)","command(ls)","command(cat)","command(head)","command(tail)","command(wc)"]}}' \
  -p "$PROMPT" < /dev/null > "$LOG" 2>&1
CLI_EXIT=$?

# Column-0 AND status-line shaped only (a colon or the exact phrasing): the log
# can quote the diff, and a reviewer's own prose at column 0 ("Error handling
# was checked", "Permission checks are denied for ...") must never abort a
# completed review.
abort_lines() {
  grep -E '^(ERROR|Error|Fatal|FATAL|panic): |^(Permission denied|Command denied|Command refused|Tool denied|Request timed out|Print timeout exceeded|Timed out)(:| after| exceeded)|^Permission to use .* has been denied|^Auto-denied|^(Output|Response) truncated|^\[truncated\]|^Review was interrupted|^ERROR: You.ve hit your usage limit' "$LOG"
}

# A code fence left open means the answer was cut mid-block.
fence_unbalanced() {
  [ $(( $(grep -c '^[[:space:]]*```' "$LOG") % 2 )) -eq 1 ]
}

# The positive completion signal: the answer's last non-blank line is exactly
# END OF REVIEW (trailing whitespace tolerated). Anything else was cut off.
has_end_marker() {
  [ "$(awk 'NF{l=$0} END{sub(/[[:space:]]+$/, "", l); print l}' "$LOG")" = "$END_MARKER" ]
}

# No marker line: the whole log is the verdict (agy prints only the answer).
VERDICT="$(cat "$LOG")"
if [ -z "$(printf '%s' "$VERDICT" | tr -d '[:space:]')" ]; then
  echo "agy-review: GATE DID NOT RUN (empty output; cli exit ${CLI_EXIT}; agy exits 0 on a timeout or a refused command). This is not a verdict. No evidence emitted."
  exit 2
fi

echo "$VERDICT"
review_note_preexisting agy-review "$VERDICT"
review_note_not_this_round agy-review "$VERDICT"

# 0 only when the review FINISHED, for the coverage claim a next round trusts.
review_finished() {
  [ "$CLI_EXIT" -eq 0 ] && has_end_marker && ! abort_lines > /dev/null && ! fence_unbalanced &&
    ! review_text_imatches '\breview[[:space:]]+(did not run|was interrupted|interrupted)\b|unable to complete the review' "$VERDICT"
}

# FINDINGS BEFORE EVERY INCOMPLETENESS GUARD: a review that reported a defect
# and then hit a blocker has still reported a defect.
if review_has_findings "$VERDICT"; then
  echo
  echo "agy-review: findings above. Fix them, commit, and re-run; the evidence line is for the NEW head."
  if [ "$POST" = 1 ]; then
    PR="$("$GH" pr view --json number -q .number)"
    COVERAGE=""
    if review_finished; then COVERAGE="Coverage: complete from ${COVERED_FROM:0:9}"; fi
    if ! "$GH" pr comment "$PR" --body "$(printf 'Agy findings for %s (not gate evidence):\n%s\n\n%s\n' "${HEAD_SHA:0:9}" "$COVERAGE" "$VERDICT")"; then
      echo "agy-review: findings were NOT posted (gh failed). Exit 2; nothing recorded. Re-run once gh works." >&2
      exit 2
    fi
    FOUND="$(review_finding_count "$VERDICT")"
    if ! bash "$POSTER" --withdraw "$PR" agy "$BASE_SHA" "$HEAD_SHA" "${FOUND} findings, not addressed" "$LOG"; then
      echo "agy-review: findings posted, but the earlier clean evidence for this head could NOT be withdrawn. Exit 2; check the gate status by hand." >&2
      exit 2
    fi
  fi
  exit 1
fi

# No findings: the incompleteness guards decide, and they are strict. The end
# marker comes first: no clean verdict is accepted from an answer that was cut off.
if ! has_end_marker; then
  echo
  echo "agy-review: GATE DID NOT RUN (the answer does not end with a line reading ${END_MARKER}; cut off or incomplete). This is not a verdict. No evidence emitted."
  exit 2
fi
if abort_lines > /dev/null; then
  echo
  echo "agy-review: GATE DID NOT RUN (timeout, refused command or error line in the output; cli exit ${CLI_EXIT}). This is not a verdict."
  abort_lines | head -3
  exit 2
fi
if fence_unbalanced; then
  echo
  echo "agy-review: GATE DID NOT RUN (output truncated inside a code block). No evidence emitted."
  exit 2
fi
if [ "$CLI_EXIT" -ne 0 ]; then
  echo
  echo "agy-review: cli exited ${CLI_EXIT}; treating the run as NOT completed (exit 2). No evidence emitted."
  exit 2
fi
if review_text_imatches '\breview[[:space:]]+(did not run|was interrupted|interrupted)\b|unable to complete the review' "$VERDICT"; then
  echo
  echo "agy-review: GATE DID NOT RUN (verdict reports an incomplete review). No evidence emitted."
  exit 2
fi
if ! review_verdict_is_clean "$VERDICT"; then
  echo
  echo "agy-review: verdict is neither findings nor an explicit clean verdict: unrecognized or truncated output, treat as not run (exit 2). No evidence emitted."
  exit 2
fi

VERDICT_LINE="no findings"
if [ "$POST" = 1 ]; then
  PR="$("$GH" pr view --json number -q .number)"
  if ! REVIEW_COVERAGE_FROM="$(review_finished && printf '%s' "${COVERED_FROM:0:9}")" bash "$POSTER" "$PR" agy "$BASE_SHA" "$HEAD_SHA" "$VERDICT_LINE" "$LOG"; then
    echo "agy-review: review was clean but the evidence was NOT posted (poster failed). Exit 2; nothing recorded." >&2
    exit 2
  fi
else
  echo
  echo "agy-review: clean. Do NOT type the evidence by hand; re-run with --post, or:"
  echo "  bash scripts/qa/post-review-gate.sh <pr> agy ${BASE_SHA:0:9} ${HEAD_SHA:0:9} \"$VERDICT_LINE\" $(printf '%q' "$LOG")"
  echo "Review gate: agy reviewed ${BASE_SHA:0:9}..${HEAD_SHA:0:9} — no findings"
fi
exit 0

#!/usr/bin/env bash
# The ONLY writer of `Review gate:` evidence comments. An agent that ran a
# review calls this with the log; an agent that did not has no log to hash.
# Format contract: line 1 is the evidence line scripts/qa/review-gate.ts
# parses; line 2 is the sha256 of the review log; the rest is the verdict
# block, fenced, so the PR carries what the reviewer actually said.
#
# With --withdraw it writes the MIRROR of that: an evidence line the checker
# REJECTS, so a re-review that finds defects turns a green gate red. Without it
# a second review of the same head could only add a findings comment, which
# `review-gate.ts` never reads, leaving the earlier clean attestation as the
# latest evidence for a SHA now known to be defective (Codex review of #2115,
# round 3). A withdrawal is refused unless the verdict really is one the
# checker rejects and the log really does carry findings — it can only ever
# make the gate redder.
#
# Usage: post-review-gate.sh [--withdraw] <pr> <codex|claude> <base-sha> <head-sha> "<verdict>" <log>
# Exit:  0 posted · 2 refused (bad verdict grammar or empty log); nothing posted
set -euo pipefail
WITHDRAW=0
if [ "${1:-}" = "--withdraw" ]; then WITHDRAW=1; shift; fi
PR="$1"; REVIEWER="$2"; BASE="$3"; HEAD="$4"; VERDICT="$5"; LOG="$6"
GH="${GH_BIN:-gh}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# One definition of "clean verdict", shared with both review wrappers.
# shellcheck source=scripts/qa/review-verdict.sh
. "$HERE/review-verdict.sh"

case "$REVIEWER" in codex|claude) ;; *) echo "post-review-gate: reviewer must be codex or claude" >&2; exit 2;; esac
# ONE grammar: ask the parser that will judge the comment, never a copied regex.
VERDICT_ACCEPTED=0
if node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
  "$HERE/review-gate.ts" --verdict "$VERDICT"; then
  VERDICT_ACCEPTED=1
fi
if [ "$WITHDRAW" = 1 ]; then
  if [ "$VERDICT_ACCEPTED" = 1 ]; then
    echo "post-review-gate: '$VERDICT' is a CLEAN verdict, so it cannot withdraw anything; nothing posted" >&2
    exit 2
  fi
elif [ "$VERDICT_ACCEPTED" != 1 ]; then
  echo "post-review-gate: verdict '$VERDICT' is outside the gate grammar (review-gate.ts CLEAN_VERDICT); nothing posted" >&2
  exit 2
fi
if [ ! -s "$LOG" ]; then
  echo "post-review-gate: log '$LOG' is empty or missing; nothing posted" >&2
  exit 2
fi
HASH="$(shasum -a 256 "$LOG" | cut -d' ' -f1)"
# Codex logs carry a `codex` marker line before the verdict; `claude -p` output
# has no marker, so the whole log is the verdict. Never a `tail`: a long clean
# Claude review would lose its opening contract sentence and be refused
# (Codex review of #2110, round 9).
VERDICT_BLOCK="$(awk '/^codex$/{f=1; next} f' "$LOG")"
[ -n "$VERDICT_BLOCK" ] || VERDICT_BLOCK="$(cat "$LOG")"

# The log must SUPPORT the verdict. The poster is reachable without the Codex
# wrapper (the Claude path calls it directly), so it re-checks what the wrapper
# checks: an interrupted or incomplete review is never evidence, and "no
# findings" needs a clean sentence in the log, not just a caller's say-so.
#
# Completeness gates ATTESTATIONS only. A review that found a defect and then
# hit a blocker has still found a defect, and refusing its withdrawal would
# leave an earlier clean attestation standing over a head now known to be
# broken — the completeness rule protecting the very state it exists to
# prevent (Codex review of #2115, round 4). A withdrawal still has to carry
# [P*] bullets, which is checked below.
if [ "$WITHDRAW" != 1 ] &&
  { grep -Eq "^(ERROR: You've hit your usage limit|Review was interrupted)" "$LOG" ||
    printf '%s' "$VERDICT_BLOCK" | grep -Eiq '\bunable to complete the review\b|\breview (did not run|was interrupted)\b'; }; then
  echo "post-review-gate: log does not support any verdict (review did not complete); nothing posted" >&2
  exit 2
fi
if [ "$WITHDRAW" = 1 ]; then
  # A withdrawal is the mirror image: it must be backed by a log that really
  # does carry findings, so "withdraw" cannot be used to red-flag a head
  # nothing objected to.
  if ! printf '%s' "$VERDICT_BLOCK" | grep -Eq '^\s*- \[P[0-9]\]'; then
    echo "post-review-gate: log does not support withdrawing '$VERDICT' (it carries no [P*] bullets); nothing posted" >&2
    exit 2
  fi
fi
# Both accepted verdicts describe a CLEAN final log: "N findings, all
# addressed" means the reviewer was re-run on the fixed head and that re-run
# came back clean, so the log it is posted with must pass the same checks
# (Codex review of #2110, round 8). No verdict form skips them.
if [ "$WITHDRAW" != 1 ]; then
  if printf '%s' "$VERDICT_BLOCK" | grep -Eq '^\s*- \[P[0-9]\]'; then
    echo "post-review-gate: log does not support '$VERDICT' (it still carries [P*] bullets); nothing posted" >&2
    exit 2
  fi
  # Not free text: both review wrappers instruct the reviewer to open a clean
  # verdict with the CONTRACT sentence "No actionable <findings> ..." and
  # nothing else counts. "No findings yet; only the workflow file has been
  # inspected" is a clean-looking sentence about an incomplete review, and any
  # regex that guesses at completeness from prose will be fooled by the next
  # phrasing (Codex review of #2110, round 7). The sentence rule itself lives in
  # review-verdict.sh — the same one codex-review.sh and claude-review.sh apply.
  if ! review_verdict_is_clean "$VERDICT_BLOCK"; then
    echo "post-review-gate: log does not support '$VERDICT' (first paragraph lacks the contract sentence 'No actionable ...'); nothing posted" >&2
    exit 2
  fi
fi
BODY="$(printf 'Review gate: %s reviewed %s..%s — %s\nlog sha256: %s\n\n<details><summary>%s verdict</summary>\n\n```text\n%s\n```\n\n</details>\n' \
  "$REVIEWER" "${BASE:0:9}" "${HEAD:0:9}" "$VERDICT" "$HASH" "$REVIEWER" "$VERDICT_BLOCK")"
"$GH" pr comment "$PR" --body "$BODY"
echo "post-review-gate: posted '$VERDICT' for ${HEAD:0:9} on #$PR (log sha256 ${HASH:0:12})"

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
# Usage: post-review-gate.sh [--withdraw] <pr> <codex|claude|adversarial|none|owner> <base-sha> <head-sha> "<verdict>" <log>
# Exit:  0 posted · 2 refused (bad reviewer/verdict grammar, missing owner
#        env vars, or empty log); nothing posted
#
# The `owner` tier additionally requires OVERRIDE_REASON="<harness>
# unavailable — <detail>" and DEFERRED_REVIEW=<ISSUE-ID> in the environment;
# they are appended as the 2nd and 3rd lines of the comment body.
#
# POST_REVIEW_GATE_DRY_RUN=1 validates the reviewer token, the owner-tier env
# vars and the verdict-vs-tier grammar, then exits 0 WITHOUT touching the log
# or calling gh — so a contract test can probe reviewer/tier validation
# without a real review log or a live PR.
set -euo pipefail
WITHDRAW=0
if [ "${1:-}" = "--withdraw" ]; then WITHDRAW=1; shift; fi
PR="$1"; REVIEWER="$2"; BASE="$3"; HEAD="$4"; VERDICT="$5"; LOG="$6"
GH="${GH_BIN:-gh}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# One definition of "clean verdict", shared with both review wrappers.
# shellcheck source=scripts/qa/review-verdict.sh
. "$HERE/review-verdict.sh"

case "$REVIEWER" in
  codex|claude|adversarial|none|owner) ;;
  *) echo "post-review-gate: reviewer must be codex, claude, adversarial, none or owner" >&2; exit 2;;
esac

# The `owner` tier defers scrutiny rather than skipping it, so it needs a
# reason (which harness was unavailable and why) and a tracked issue to
# re-review later — without either there is no debt record and the override
# is refused. Checked before the verdict/log work below so a caller who
# forgot the env vars gets a fast, cheap failure.
if [ "$REVIEWER" = "owner" ]; then
  [ -n "${OVERRIDE_REASON:-}" ] || { echo "post-review-gate: owner tier needs OVERRIDE_REASON=\"<harness> unavailable — <detail>\"" >&2; exit 2; }
  [ -n "${DEFERRED_REVIEW:-}" ] || { echo "post-review-gate: owner tier needs DEFERRED_REVIEW=<ISSUE-ID>" >&2; exit 2; }
fi

# ONE grammar: ask the parser that will judge the comment, never a copied
# regex. `--reviewer` binds the check to THIS reviewer's own tier grammar so
# a codex/independent line wearing an owner/adversarial verdict phrase is
# refused here instead of being posted and then refused by the real gate.
VERDICT_ACCEPTED=0
if node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
  "$HERE/review-gate.ts" --reviewer "$REVIEWER" --verdict "$VERDICT"; then
  VERDICT_ACCEPTED=1
fi

if [ "${POST_REVIEW_GATE_DRY_RUN:-}" = "1" ]; then
  if [ "$WITHDRAW" = 1 ]; then
    if [ "$VERDICT_ACCEPTED" = 1 ]; then
      echo "post-review-gate: [dry run] '$VERDICT' is a CLEAN verdict, so it cannot withdraw anything; nothing posted" >&2
      exit 2
    fi
  elif [ "$VERDICT_ACCEPTED" != 1 ]; then
    echo "post-review-gate: [dry run] verdict '$VERDICT' is outside the '$REVIEWER' tier grammar; nothing posted" >&2
    exit 2
  fi
  echo "post-review-gate: [dry run] '$VERDICT' accepted for reviewer '$REVIEWER'; nothing posted"
  exit 0
fi

if [ "$WITHDRAW" = 1 ]; then
  if [ "$VERDICT_ACCEPTED" = 1 ]; then
    echo "post-review-gate: '$VERDICT' is a CLEAN verdict, so it cannot withdraw anything; nothing posted" >&2
    exit 2
  fi
elif [ "$VERDICT_ACCEPTED" != 1 ]; then
  echo "post-review-gate: verdict '$VERDICT' is outside the gate grammar (review-gate.ts verdictAccepted); nothing posted" >&2
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
VERDICT_BLOCK="$(review_last_block "$LOG")"
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
    review_text_imatches '\bunable to complete the review\b|\breview (did not run|was interrupted)\b' "$VERDICT_BLOCK"; }; then
  echo "post-review-gate: log does not support any verdict (review did not complete); nothing posted" >&2
  exit 2
fi
if [ "$WITHDRAW" = 1 ]; then
  # A withdrawal is the mirror image: it must be backed by a log that really
  # does carry findings, so "withdraw" cannot be used to red-flag a head
  # nothing objected to.
  if ! review_text_matches "$REVIEW_FINDING_BULLET" "$VERDICT_BLOCK"; then
    echo "post-review-gate: log does not support withdrawing '$VERDICT' (it carries no [P*] bullets); nothing posted" >&2
    exit 2
  fi
fi
# Both accepted verdicts describe a CLEAN final log: "N findings, all
# addressed" means the reviewer was re-run on the fixed head and that re-run
# came back clean, so the log it is posted with must pass the same checks
# (Codex review of #2110, round 8). No verdict form skips them.
if [ "$WITHDRAW" != 1 ]; then
  if review_text_matches "$REVIEW_FINDING_BULLET" "$VERDICT_BLOCK"; then
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
if [ "$REVIEWER" = "owner" ]; then
  # Owner tier: Override reason and Deferred re-review are the 2nd and 3rd
  # lines, ahead of the log hash — overrideAccepted (review-gate.ts) matches
  # them anywhere in the body via `m`, but the brief fixes their position so
  # the override's own contract reads first, before the log provenance line.
  BODY="$(printf 'Review gate: %s reviewed %s..%s — %s\nOverride reason: %s\nDeferred re-review: %s\nlog sha256: %s\n\n<details><summary>%s verdict</summary>\n\n```text\n%s\n```\n\n</details>\n' \
    "$REVIEWER" "${BASE:0:9}" "${HEAD:0:9}" "$VERDICT" "$OVERRIDE_REASON" "$DEFERRED_REVIEW" "$HASH" "$REVIEWER" "$VERDICT_BLOCK")"
else
  BODY="$(printf 'Review gate: %s reviewed %s..%s — %s\nlog sha256: %s\n\n<details><summary>%s verdict</summary>\n\n```text\n%s\n```\n\n</details>\n' \
    "$REVIEWER" "${BASE:0:9}" "${HEAD:0:9}" "$VERDICT" "$HASH" "$REVIEWER" "$VERDICT_BLOCK")"
fi
"$GH" pr comment "$PR" --body "$BODY"
echo "post-review-gate: posted '$VERDICT' for ${HEAD:0:9} on #$PR (log sha256 ${HASH:0:12})"

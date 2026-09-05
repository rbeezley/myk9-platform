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
# Usage: scripts/qa/codex-review.sh [base-ref]      (default: origin/main)
# Env:   CODEX_BIN  override the codex executable (tests use a stub)
# Exit:  0 review ran and found nothing actionable
#        1 review ran and reported findings (fix, re-run against the new head)
#        2 review did NOT run (usage limit / interrupted) — not a verdict
set -uo pipefail

BASE_REF="${1:-origin/main}"
CODEX="${CODEX_BIN:-codex}"
BASE_SHA="$(git rev-parse "$BASE_REF")"
HEAD_SHA="$(git rev-parse HEAD)"
LOG="${CODEX_REVIEW_LOG:-/tmp/codex-review-${HEAD_SHA}.log}"

echo "codex-review: ${BASE_REF} (${BASE_SHA:0:9}) .. HEAD (${HEAD_SHA:0:9}) -> ${LOG}"
"$CODEX" review --base "$BASE_REF" < /dev/null > "$LOG" 2>&1
CLI_EXIT=$?

if grep -Eq "^(ERROR: You've hit your usage limit|Review was interrupted)" "$LOG"; then
  echo "codex-review: GATE DID NOT RUN (usage limit or interrupted; cli exit ${CLI_EXIT}). This is not a verdict."
  grep -E "^(ERROR: You've hit your usage limit|Review was interrupted)" "$LOG" | head -3
  exit 2
fi

# The verdict is everything after the CLI's own "codex" marker line.
VERDICT="$(awk '/^codex$/{f=1; next} f' "$LOG")"
if [ -z "$VERDICT" ]; then
  echo "codex-review: no verdict block found in the log (cli exit ${CLI_EXIT}); treat as not run."
  tail -5 "$LOG"
  exit 2
fi

echo "$VERDICT"
if echo "$VERDICT" | grep -Eq '^\s*- \[P[0-9]\]'; then
  echo
  echo "codex-review: findings above. Fix them, commit, and re-run — the evidence line is for the NEW head."
  exit 1
fi

echo
echo "codex-review: clean. Post this as the FIRST line of a PR comment:"
echo "Review gate: codex reviewed ${BASE_SHA:0:9}..${HEAD_SHA:0:9} — no findings"
exit 0

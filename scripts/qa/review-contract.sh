#!/usr/bin/env bash
# Print the review verdict contract: the one paragraph every reviewer gets
# (codex-review.sh's REVIEW_INSTRUCTIONS). claude-review.sh sends it, and the
# orchestrator pastes it into each adversarial lens prompt (MYK9-1613), so a
# lens reports a capped finding as `[unlikely P3]` instead of a blocking `[P3]`.
# Exits 2 when it cannot be read, so no caller reviews without it.
#
# Usage: bash scripts/qa/review-contract.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CONTRACT="$(sed -n "s/^REVIEW_INSTRUCTIONS='\(.*\)'\$/\1/p" "$HERE/codex-review.sh")"
if [ -z "$CONTRACT" ]; then
  echo "review-contract: could not read REVIEW_INSTRUCTIONS from codex-review.sh (exit 2)." >&2
  exit 2
fi
printf '%s\n' "$CONTRACT"

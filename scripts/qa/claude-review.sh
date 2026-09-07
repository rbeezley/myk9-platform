#!/usr/bin/env bash
# The Claude-reviews-Codex half of the gate, with the SAME contract as
# scripts/qa/codex-review.sh: `claude -p` also exits 0 when it was interrupted,
# hit a usage limit, or came back with findings, so the exit code is never the
# verdict. This wrapper reads the log, applies the same first-paragraph rule,
# and — with --post — hands the result to scripts/qa/post-review-gate.sh, the
# only writer of `Review gate:` evidence comments.
#
# The verdict contract text is EXTRACTED from codex-review.sh rather than
# copied: two reviewers judged by two paragraphs is how a gate quietly starts
# accepting different things from each harness. If the extraction ever comes
# back empty the wrapper exits 2 instead of reviewing without a contract.
#
# Usage: bash scripts/qa/claude-review.sh [--post] [pr-number]
# Env:   CLAUDE_BIN         override the claude executable (tests use a stub)
#        GH_BIN             override the gh executable (tests use a stub)
#        CLAUDE_REVIEW_LOG  override the log path
# Exit:  0 review ran and found nothing actionable
#        1 review ran and reported findings (fix, re-run against the new head)
#        2 review did NOT complete, or the evidence was not posted — not a verdict
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(git rev-parse --show-toplevel)"
CLAUDE="${CLAUDE_BIN:-claude}"
GH="${GH_BIN:-gh}"
POSTER="$HERE/post-review-gate.sh"

POST=0
PR=""
for arg in "$@"; do
  case "$arg" in
    --post) POST=1 ;;
    --) ;;
    *) PR="$arg" ;;
  esac
done
[ -n "$PR" ] || PR="$("$GH" pr view --json number -q .number)"
if [ -z "$PR" ]; then
  echo "claude-review: no PR number given and gh could not find one" >&2
  exit 2
fi

BASE_SHA="$(git rev-parse origin/main)"
HEAD_SHA="$(git rev-parse HEAD)"
mkdir -p "$ROOT/.logs"
LOG="${CLAUDE_REVIEW_LOG:-$ROOT/.logs/claude-review-${HEAD_SHA}.log}"

# One contract, one owner: the paragraph codex-review.sh sends its reviewer.
CONTRACT="$(sed -n "s/^REVIEW_INSTRUCTIONS='\(.*\)'\$/\1/p" "$HERE/codex-review.sh")"
if [ -z "$CONTRACT" ]; then
  echo "claude-review: could not read REVIEW_INSTRUCTIONS from codex-review.sh; refusing to review without the verdict contract (exit 2)." >&2
  exit 2
fi

echo "claude-review: PR #${PR}, origin/main (${BASE_SHA:0:9}) .. HEAD (${HEAD_SHA:0:9}) -> ${LOG}"
"$CLAUDE" -p "$(printf '/code-review %s\n\n%s\n' "$PR" "$CONTRACT")" < /dev/null > "$LOG" 2>&1
CLI_EXIT=$?

if [ ! -s "$LOG" ]; then
  echo "claude-review: empty log (cli exit ${CLI_EXIT}); treat as not run. No evidence emitted."
  exit 2
fi

# Line-anchored: the log may echo the diff, and a diff that mentions these
# phrases (this file does) matched an unanchored grep on 2026-09-05.
if grep -Eq "^(ERROR: You've hit your usage limit|Review was interrupted)" "$LOG"; then
  echo "claude-review: GATE DID NOT RUN (usage limit or interrupted; cli exit ${CLI_EXIT}). This is not a verdict."
  exit 2
fi

# `claude -p` prints no marker line, so the whole log is the verdict.
VERDICT="$(cat "$LOG")"
echo "$VERDICT"

if echo "$VERDICT" | grep -Eq '^\s*- \[P[0-9]\]'; then
  echo
  echo "claude-review: findings above. Fix them, commit, and re-run — the evidence is for the NEW head."
  if [ "$POST" = 1 ]; then
    "$GH" pr comment "$PR" --body "$(printf 'Claude findings for %s (not gate evidence):\n\n%s\n' "${HEAD_SHA:0:9}" "$VERDICT")"
  fi
  exit 1
fi

if [ "$CLI_EXIT" -ne 0 ]; then
  echo
  echo "claude-review: cli exited ${CLI_EXIT}; treating the run as NOT completed (exit 2). No evidence emitted."
  exit 2
fi
if echo "$VERDICT" | grep -Eiq '\breview[[:space:]]+(did not run|was interrupted|interrupted)\b'; then
  echo
  echo "claude-review: GATE DID NOT RUN (verdict reports an incomplete review). No evidence emitted."
  exit 2
fi

# Clean is a POSITIVE match on the first paragraph, never the absence of
# findings — identical to codex-review.sh, deliberately.
FIRST_PARAGRAPH="$(echo "$VERDICT" | awk '
  /^[[:space:]]*$/ { if (started) exit; next }
  { printf "%s%s", started ? " " : "", $0; started=1 }
')"
if ! { echo "$FIRST_PARAGRAPH" | grep -Eiq '^[[:space:]]*no actionable\b' ||
  echo "$FIRST_PARAGRAPH" | grep -Eq '[.!?][[:space:]]+No actionable\b'; }; then
  echo
  echo "claude-review: verdict is neither findings nor an explicit clean verdict — unrecognized output, treat as not run (exit 2). No evidence emitted."
  exit 2
fi

VERDICT_LINE="no findings"
if [ "$POST" = 1 ]; then
  PRIOR="$("$GH" pr view "$PR" --json comments -q '[.comments[].body | select(startswith("Claude findings for"))] | join("\n")')"
  N="$(printf '%s' "$PRIOR" | grep -cE '^\s*- \[P[0-9]\]' || true)"
  [ "${N:-0}" -gt 0 ] && VERDICT_LINE="$N findings, all addressed"
  if ! bash "$POSTER" "$PR" claude "$BASE_SHA" "$HEAD_SHA" "$VERDICT_LINE" "$LOG"; then
    echo "claude-review: review was clean but the evidence was NOT posted (poster failed). Exit 2; nothing recorded." >&2
    exit 2
  fi
else
  echo
  echo "claude-review: clean. Do NOT type the evidence by hand — re-run with --post, or:"
  echo "  bash scripts/qa/post-review-gate.sh $PR claude ${BASE_SHA:0:9} ${HEAD_SHA:0:9} \"$VERDICT_LINE\" $LOG"
fi
exit 0

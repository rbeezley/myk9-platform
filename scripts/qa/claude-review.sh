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
#        bash scripts/qa/claude-review.sh --detach [--post] [pr-number]
#        bash scripts/qa/claude-review.sh --wait <seconds> [pr-number]
#
# A real `/code-review` of a PR takes 5-20 minutes and `claude -p` prints
# NOTHING until it finishes, so a caller with a per-command timeout sees an
# empty log and a killed process. On 2026-09-07 Codex ran
# `timeout 180 claude -p ...` twice against PR #2124, got an empty log both
# times, and left the PR draft with "no verdict". `--detach` starts the review
# under nohup and returns at once; `--wait N` blocks up to N seconds for the
# detached run's exit code and returns 3 while it is still running, so each
# poll fits inside any tool timeout. Never wrap this script in `timeout`.
#
# Env:   CLAUDE_BIN               override the claude executable (tests use a stub)
#        CLAUDE_REVIEW_NET_PROBE  override the network probe command (tests); "000" output = no network
#        GH_BIN                   override the gh executable (tests use a stub)
#        CLAUDE_REVIEW_LOG        override the log path
#        CLAUDE_REVIEW_STATE_DIR  where --detach writes <pr>.status / <pr>.out (default .logs/)
# Exit:  0 review ran and found nothing actionable
#        1 review ran and reported findings (fix, re-run against the new head)
#        2 review did NOT complete, or the evidence was not posted — not a verdict
#        3 (--wait only) the detached review is still running; call --wait again
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(git rev-parse --show-toplevel)"
CLAUDE="${CLAUDE_BIN:-claude}"
GH="${GH_BIN:-gh}"
POSTER="$HERE/post-review-gate.sh"
# One definition of "clean verdict" for both wrappers and the poster.
# shellcheck source=scripts/qa/review-verdict.sh
. "$HERE/review-verdict.sh"

POST=0
DETACH=0
WAIT=""
PR=""
CHILD_ARGS=()
expect_wait=0
for arg in "$@"; do
  if [ "$expect_wait" = 1 ]; then WAIT="$arg"; expect_wait=0; continue; fi
  case "$arg" in
    --post) POST=1; CHILD_ARGS+=("$arg") ;;
    --detach) DETACH=1 ;;
    --wait) expect_wait=1 ;;
    --) ;;
    *) PR="$arg"; CHILD_ARGS+=("$arg") ;;
  esac
done
if [ "$expect_wait" = 1 ]; then
  echo "claude-review: --wait needs a number of seconds (usage: --wait <seconds> [pr-number])" >&2
  exit 2
fi
# The preflight exists for ONE case: first-party claude.ai login, whose
# credentials live in the macOS Keychain that Codex's sandbox denies. Any auth
# configured through the environment (API key, bearer token, Bedrock, Vertex)
# neither uses the Keychain nor calls a host the wrapper can name, so both
# probes are skipped and the review itself is the check (Codex review of
# #2127, rounds 5-7).
# Credentials count when non-empty; provider flags only when set to exactly 1,
# since an explicit CLAUDE_CODE_USE_BEDROCK=0 means "not Bedrock" (Codex review
# of #2127, round 8).
ENV_AUTH=0
[ -n "${ANTHROPIC_API_KEY:-}" ] && ENV_AUTH=1
[ -n "${ANTHROPIC_AUTH_TOKEN:-}" ] && ENV_AUTH=1
[ "${CLAUDE_CODE_USE_BEDROCK:-}" = "1" ] && ENV_AUTH=1
[ "${CLAUDE_CODE_USE_VERTEX:-}" = "1" ] && ENV_AUTH=1
if [ -z "$WAIT" ] && [ "$ENV_AUTH" = 0 ]; then
  # Preflight (before ANY gh/network call, which would hang the same way — Codex
  # review of #2127): the review needs the macOS Keychain (Claude's credentials) and the
  # network. Codex's workspace-write sandbox denies both, and the symptoms are
  # misleading: keychain denied reads as "Not logged in · Please run /login" even
  # though the user IS logged in, and network denied hangs ~3 minutes before
  # "Can't reach the API server" (Codex on #2124, 2026-09-07: three timed-out
  # runs, then a false "not logged in"). Fail in seconds and say what to do.
  ESCALATE_HINT="This must run OUTSIDE the sandbox: Codex should re-run it with escalated permissions, or — if its approval policy forbids that — stop and ask Richard to run \`bash scripts/qa/claude-review.sh --detach --post ${PR:-<pr>}\` from a terminal."
  # Both the exit code AND the payload: the CLI has reported {"loggedIn": false}
  # with exit 0 in some versions (Codex review of #2127, round 4), and the
  # measured sandbox case is exit 1 — require loggedIn:true either way.
  AUTH_JSON="$("$CLAUDE" auth status 2>/dev/null)"; AUTH_EXIT=$?
  if [ "$AUTH_EXIT" -ne 0 ] || ! printf '%s' "$AUTH_JSON" | grep -Eq '"loggedIn":[[:space:]]*true'; then
    echo "claude-review: \`claude auth status\` says not logged in HERE. If the user is logged in interactively, this shell cannot reach the Keychain (a sandbox). ${ESCALATE_HINT} Exit 2; nothing recorded." >&2
    exit 2
  fi
  # The default lives in its own variable: a `}` inside `${VAR:-default}` (curl's
  # %{http_code}) closes the expansion early and the rest of the URL leaks into
  # the probe's output, so "000" never matches.
  # Probe the endpoint Claude will actually call: ANTHROPIC_BASE_URL when a
  # Bedrock/Vertex/proxy setup overrides it, first-party otherwise (Codex
  # review of #2127, round 5).
  NET_PROBE_DEFAULT="curl -sS -o /dev/null -m 5 -w %{http_code} ${ANTHROPIC_BASE_URL:-https://api.anthropic.com}/"
  NET_PROBE="${CLAUDE_REVIEW_NET_PROBE:-$NET_PROBE_DEFAULT}"
  # The probe measures the shell's real capability. Codex's marker
  # (CODEX_SANDBOX_NETWORK_DISABLED=1) is only a hint: an escalated re-run can
  # inherit it from the sandboxed parent while actually having network, and
  # trusting it alone would block the documented escalation path (Codex review
  # of #2127, round 3).
  if [ "$($NET_PROBE 2>/dev/null)" = "000" ]; then
    MARKER=""; [ "${CODEX_SANDBOX_NETWORK_DISABLED:-}" = "1" ] && MARKER=" (Codex sandbox marker present)"
    echo "claude-review: no network from this shell${MARKER} — ${ANTHROPIC_BASE_URL:-https://api.anthropic.com} unreachable, so the review would hang until killed. ${ESCALATE_HINT} Exit 2; nothing recorded." >&2
    exit 2
  fi
fi

[ -n "$PR" ] || PR="$("$GH" pr view --json number -q .number)"
if [ -z "$PR" ]; then
  echo "claude-review: no PR number given and gh could not find one" >&2
  exit 2
fi

STATE_DIR="${CLAUDE_REVIEW_STATE_DIR:-$ROOT/.logs}"
STATUS_FILE="$STATE_DIR/claude-review-${PR}.status"
OUT_FILE="$STATE_DIR/claude-review-${PR}.out"
PID_FILE="$STATE_DIR/claude-review-${PR}.pid"

# --wait: poll the detached run. Exit codes are the child's; 3 = still running.
if [ -n "$WAIT" ]; then
  case "$WAIT" in ''|*[!0-9]*) echo "claude-review: --wait needs a number of seconds" >&2; exit 2 ;; esac
  if [ ! -f "$STATUS_FILE" ]; then
    echo "claude-review: no detached review for PR #${PR} (no ${STATUS_FILE}); start one with --detach" >&2
    exit 2
  fi
  waited=0
  while :; do
    st="$(cat "$STATUS_FILE" 2>/dev/null)"
    case "$st" in
      ''|*[!0-9]*)
        # "running pid=N since=T": is N still alive? A sandbox that reaps
        # background processes when the shell call ends (Codex, #2131 on
        # 2026-09-08) leaves this file saying "running" forever while nothing
        # runs; without this check --wait returned 3 for 43 minutes.
        pid="$(cat "$PID_FILE" 2>/dev/null)"
        if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
          # Re-read: the child may have written its exit code between our read
          # and the liveness probe (Codex review of #2132, round 2).
          st2="$(cat "$STATUS_FILE" 2>/dev/null)"
          case "$st2" in ''|*[!0-9]*) ;; *) continue ;; esac
          echo "2" > "$STATUS_FILE"
          [ -f "$OUT_FILE" ] && cat "$OUT_FILE"
          echo "claude-review: the detached review for PR #${PR} (pid ${pid}) is gone without recording a verdict. A sandbox that kills background processes when the shell call returns does this. Re-run --detach with escalated permissions, or ask Richard to run it from a terminal. Exit 2; nothing recorded." >&2
          exit 2
        fi
        ;;
      *) [ -f "$OUT_FILE" ] && cat "$OUT_FILE"; echo "claude-review: detached review for PR #${PR} finished with exit ${st}"; exit "$st" ;;
    esac
    if [ "$waited" -ge "$WAIT" ]; then
      echo "claude-review: PR #${PR} review still running (${st}); call --wait again. Exit 3 is not a verdict."
      exit 3
    fi
    sleep 1; waited=$((waited + 1))
  done
fi

BASE_SHA="$(git rev-parse origin/main)"
HEAD_SHA="$(git rev-parse HEAD)"

# Before detaching (a refusal must be visible now, not in a status file — the
# 2026-09-08 run from a `main` checkout detached and then failed silently):
# `/code-review <pr>` reviews the REMOTE PR head; the evidence names local HEAD.
# With an unpushed commit those are different commits, so a clean review of the
# pushed head would attest to code nobody reviewed (Codex review of #2115, P1).
# Refuse rather than guess which SHA the verdict belongs to.
PR_HEAD="$("$GH" pr view "$PR" --json headRefOid -q .headRefOid)"
if [ "$PR_HEAD" != "$HEAD_SHA" ]; then
  echo "claude-review: PR #${PR} head is ${PR_HEAD:0:9} but local HEAD is ${HEAD_SHA:0:9}." >&2
  echo "claude-review: the reviewer reads the PR, so the evidence would name a commit it never saw. Push (or check out the PR head) and re-run. Exit 2; nothing recorded." >&2
  exit 2
fi

# --detach: run this same review in the background and return at once.
if [ "$DETACH" = 1 ]; then
  mkdir -p "$STATE_DIR"
  # The running marker is written BEFORE the spawn and the pid to its own file
  # AFTER it, so a child that finishes fast can never have its exit code
  # overwritten by the marker (Codex review of #2132).
  : > "$OUT_FILE"
  : > "$PID_FILE"
  printf 'running since=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATUS_FILE"
  STATUS_FILE="$STATUS_FILE" nohup bash -c 'bash "$1" "${@:2}"; echo "$?" > "$STATUS_FILE"' _ "$0" ${CHILD_ARGS[@]+"${CHILD_ARGS[@]}"} >> "$OUT_FILE" 2>&1 &
  CHILD_PID=$!
  echo "$CHILD_PID" > "$PID_FILE"
  # Give the child a moment, then confirm it is alive (or already finished with
  # a recorded exit). A child that is gone with no exit code was killed by the
  # environment — report that now rather than from a later --wait.
  sleep "${CLAUDE_REVIEW_DETACH_GRACE:-2}"
  st="$(cat "$STATUS_FILE" 2>/dev/null)"
  case "$st" in
    ''|*[!0-9]*)
      # Re-read after the liveness probe: the child may have written its exit
      # code in between (Codex review of #2132, round 2).
      if ! kill -0 "$CHILD_PID" 2>/dev/null && ! [ "$(cat "$STATUS_FILE" 2>/dev/null)" -eq "$(cat "$STATUS_FILE" 2>/dev/null)" ] 2>/dev/null; then
        echo "2" > "$STATUS_FILE"
        echo "claude-review: the detached review (pid ${CHILD_PID}) died immediately without a verdict. This environment kills background processes; run --detach with escalated permissions, or ask Richard to run it from a terminal. Exit 2; nothing recorded." >&2
        exit 2
      fi ;;
  esac
  echo "claude-review: detached PR #${PR} review (pid ${CHILD_PID}). Output: ${OUT_FILE}. Poll with:"
  echo "  bash scripts/qa/claude-review.sh --wait 240 ${PR}    # 0 clean · 1 findings · 2 did not run · 3 still running"
  exit 0
fi


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
abort_lines() {
  grep -E "^(ERROR: You've hit your usage limit|Review was interrupted)" "$LOG"
}

# `claude -p` prints no marker line, so the whole log is the verdict.
VERDICT="$(cat "$LOG")"
echo "$VERDICT"

# FINDINGS ARE PROCESSED BEFORE EVERY INCOMPLETENESS GUARD: a review that
# reported a defect and then hit a blocker has still reported a defect, and
# exiting 2 here would leave an already-green gate green over it (Codex review
# of #2115, round 5).
if review_text_matches "$REVIEW_FINDING_BULLET" "$VERDICT"; then
  echo
  echo "claude-review: findings above. Fix them, commit, and re-run — the evidence is for the NEW head."
  if [ "$POST" = 1 ]; then
    # A lost findings comment is not cosmetic: the next clean run counts N from
    # these comments (Codex review of #2115, P2).
    if ! "$GH" pr comment "$PR" --body "$(printf 'Claude findings for %s (not gate evidence):\n\n%s\n' "${HEAD_SHA:0:9}" "$VERDICT")"; then
      echo "claude-review: findings were NOT posted (gh failed). Exit 2; nothing recorded — re-run once gh works." >&2
      exit 2
    fi
    # Withdraw any earlier clean evidence for this head: a findings comment is
    # not read by review-gate.ts, so the gate would stay green over defects
    # someone just reported (Codex review of #2115, round 3).
    FOUND="$(echo "$VERDICT" | grep -cE "$REVIEW_FINDING_BULLET" || true)"
    if ! bash "$POSTER" --withdraw "$PR" claude "$BASE_SHA" "$HEAD_SHA" "${FOUND} findings, not addressed" "$LOG"; then
      echo "claude-review: findings posted, but the earlier clean evidence for this head could NOT be withdrawn. Exit 2 — check the gate status by hand." >&2
      exit 2
    fi
  fi
  exit 1
fi

# No findings — now the incompleteness guards decide, and they are strict.
if abort_lines > /dev/null; then
  echo "claude-review: GATE DID NOT RUN (usage limit or interrupted; cli exit ${CLI_EXIT}). This is not a verdict."
  abort_lines | head -3
  exit 2
fi

if [ "$CLI_EXIT" -ne 0 ]; then
  echo
  echo "claude-review: cli exited ${CLI_EXIT}; treating the run as NOT completed (exit 2). No evidence emitted."
  exit 2
fi
if review_text_imatches '\breview[[:space:]]+(did not run|was interrupted|interrupted)\b' "$VERDICT"; then
  echo
  echo "claude-review: GATE DID NOT RUN (verdict reports an incomplete review). No evidence emitted."
  exit 2
fi

# Clean is a POSITIVE match on the first paragraph, never the absence of
# findings — the same rule codex-review.sh and the poster apply, from the same
# file, so no harness can drift into accepting something the others reject.
if ! review_verdict_is_clean "$VERDICT"; then
  echo
  echo "claude-review: verdict is neither findings nor an explicit clean verdict — unrecognized output, treat as not run (exit 2). No evidence emitted."
  exit 2
fi

VERDICT_LINE="no findings"
if [ "$POST" = 1 ]; then
  # Fail closed: a transient API failure here returns an empty history, which
  # would post "no findings" over a head that had them (Codex, #2115 round 2).
  if ! PRIOR="$("$GH" pr view "$PR" --json comments -q '[.comments[].body | select(startswith("Claude findings for"))] | join("\n")')"; then
    echo "claude-review: could not read this PR's earlier findings comments (gh failed), so N cannot be trusted. Exit 2; no evidence posted." >&2
    exit 2
  fi
  N="$(printf '%s' "$PRIOR" | grep -cE "$REVIEW_FINDING_BULLET" || true)"
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

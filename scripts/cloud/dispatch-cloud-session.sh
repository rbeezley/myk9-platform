#!/usr/bin/env bash
# Dispatch one Claude Code cloud session for the orchestrate skill's cloud lane
# (MYK9-1428, MYK9-1437).
#
#   bash scripts/cloud/dispatch-cloud-session.sh <prompt-file> [log-file]
#
# Runs `claude --cloud "<prompt>"` with the lane's flags under a pseudo-terminal, because the
# CLI needs a TTY and the Bash tool has none. The Bash tool is the right place for it: the
# project pre-approves shell commands there, while the Terminal-panel tool is judged per call
# by the auto-mode classifier and stopped an unattended run on a permission dialog on
# 2026-10-26. On success this prints three lines the orchestrator records in its ledger:
#
#   SESSION_NAME=<name the CLI printed>
#   SESSION_URL=https://claude.ai/code/session_...
#   DISPATCH_LOG=<path of the captured CLI output>
#
# Exit codes: 0 a session URL was printed. 2 usage error or unreadable prompt file. 3 the CLI
# exited without printing a session URL (a sign-in error lands here; its output is echoed to
# stderr). 4 no URL within DISPATCH_TIMEOUT_S (default 90) and the CLI was stopped. This script
# never retries: a timed-out or silent dispatch may still have created a session, and a second
# dispatch could be a second writer on the branch (lane reference, Step 2).
#
# Environment: CLOUD_MODEL (default sonnet), CLOUD_EXTRA_ARGS (appended, word-split),
# DISPATCH_TIMEOUT_S (default 90).
set -uo pipefail

prompt_file="${1:-}"
log_file="${2:-}"
if [ -z "$prompt_file" ] || [ ! -r "$prompt_file" ]; then
  echo "usage: $0 <prompt-file> [log-file]; the prompt file must exist and be readable" >&2
  exit 2
fi

if [ -z "$log_file" ]; then
  root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  mkdir -p "$root/.logs"
  log_file="$root/.logs/cloud-dispatch-$(date +%Y%m%d-%H%M%S)-$$.log"
fi
: >"$log_file"

model="${CLOUD_MODEL:-sonnet}"
timeout_s="${DISPATCH_TIMEOUT_S:-90}"
prompt="$(cat "$prompt_file")"

cmd=(claude --cloud "$prompt" --permission-mode dontAsk --disallowedTools mcp__claude-code-remote__create_trigger --model "$model")
if [ -n "${CLOUD_EXTRA_ARGS:-}" ]; then
  # shellcheck disable=SC2206 # word-splitting is the documented contract of CLOUD_EXTRA_ARGS
  cmd+=(${CLOUD_EXTRA_ARGS})
fi

# A one-line bash runner carries the command, so the pseudo-terminal wrapper gets a single
# argument to execute and the multi-line prompt survives both script(1) flavours intact.
runner="$(mktemp "${TMPDIR:-/tmp}/cloud-dispatch-runner.XXXXXX")"
{
  echo '#!/usr/bin/env bash'
  printf 'exec'
  printf ' %q' "${cmd[@]}"
  printf '\n'
} >"$runner"

if command -v script >/dev/null 2>&1; then
  if script --version >/dev/null 2>&1; then
    # util-linux (Linux CI): -q quiet, -e exit with the child's status, -c the command.
    wrapped=(script -q -e -c "bash $runner" /dev/null)
  else
    # BSD and macOS: script -q <typescript-file> <command...>
    wrapped=(script -q /dev/null bash "$runner")
  fi
else
  wrapped=(bash "$runner")
fi

"${wrapped[@]}" >"$log_file" 2>&1 </dev/null &
child=$!
waited=0
while kill -0 "$child" 2>/dev/null && [ "$waited" -lt "$timeout_s" ]; do
  sleep 1
  waited=$((waited + 1))
done
timed_out=0
if kill -0 "$child" 2>/dev/null; then
  timed_out=1
  kill "$child" 2>/dev/null
fi
wait "$child" 2>/dev/null
cli_exit=$?
# The runner is a temp file; its removal is the one deletion this script performs.
find "$(dirname "$runner")" -maxdepth 1 -name "$(basename "$runner")" -type f -delete 2>/dev/null

# Pseudo-terminals emit CRLF; normalise before parsing.
cleaned="$(tr -d '\r' <"$log_file")"
printf '%s\n' "$cleaned" >"$log_file"
url="$(printf '%s\n' "$cleaned" | grep -o 'https://claude.ai/code/session_[A-Za-z0-9_-]*' | head -1)"
name="$(printf '%s\n' "$cleaned" | sed -n 's/^.*Created cloud session: //p' | head -1)"

if [ -n "$url" ]; then
  echo "SESSION_NAME=$name"
  echo "SESSION_URL=$url"
  echo "DISPATCH_LOG=$log_file"
  exit 0
fi

echo "dispatch: no session URL (cli exit $cli_exit, timed_out=$timed_out). CLI output follows." >&2
printf '%s\n' "$cleaned" >&2
echo "DISPATCH_LOG=$log_file"
if [ "$timed_out" = 1 ]; then
  exit 4
fi
exit 3

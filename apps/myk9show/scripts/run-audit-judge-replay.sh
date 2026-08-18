#!/usr/bin/env bash
#
# Scheduled judge scoring replay (MYK9-144).
#
# Replays the highest-risk show-day workflow — a judge scoring at ringside,
# offline and back — in a real browser at 1024x768, with every shared-staging
# write intercepted. Safe to run against the shared staging project precisely
# because it never writes to it; the run fails closed if it cannot prove that.
#
# Two modes, decided by scripts/audit-judge-replay.ts:
#
#   ATTACH — PLAYWRIGHT_AUDIT_BASE_URL + PLAYWRIGHT_AUDIT_SERVER_ID are set.
#            Reuses the server the surrounding walk already started. Binds
#            nothing, which is the case that failed in the sandbox this issue
#            came from.
#   OWN    — neither is set. Starts a dev server on its own port and stops it
#            again on the way out, whatever the outcome.
#
# Usage, from apps/myk9show:
#   bash scripts/run-audit-judge-replay.sh
#   PLAYWRIGHT_AUDIT_BASE_URL=http://127.0.0.1:5173 \
#     PLAYWRIGHT_AUDIT_SERVER_ID=walk-1 bash scripts/run-audit-judge-replay.sh
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# The plan resolver exits non-zero on any ambiguous or unsafe target, and
# `set -e` turns that into a refusal to start rather than a browser run against
# somewhere unintended.
# Filtered to the assignment lines: anything else on stdout (a dotenv banner, a
# package-manager notice) would otherwise be eval'd as shell.
plan_assignments="$(pnpm exec tsx scripts/print-audit-judge-replay-plan.ts --shell | grep '^MYK9_PLAN_')"
eval "$plan_assignments"

mode="$MYK9_PLAN_MODE"
base_url="$MYK9_PLAN_BASE_URL"
server_id="$MYK9_PLAN_SERVER_ID"
data_target="$MYK9_PLAN_DATA_TARGET"
project="$MYK9_PLAN_PROJECT"
port="$MYK9_PLAN_PORT"
read -r -a specs <<< "$MYK9_PLAN_SPECS"

echo "Judge replay plan: mode=$mode base=$base_url serverId=$server_id target=$data_target"

server_pid=""

cleanup() {
  # Only ever stops a server this script started. An attached server belongs to
  # the surrounding walk and must outlive the replay.
  if [[ -n "$server_pid" ]]; then
    echo "Stopping owned app server (pid $server_pid)"
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

identity_matches() {
  local body
  body="$(curl -fsS --max-time 5 "$base_url/__myk9/audit-server-identity" 2>/dev/null)" || return 1
  [[ "$body" == *"\"serverId\":\"$server_id\""* ]] || return 1
  # The server must also point at the project the write guard is written
  # against. Playwright's global setup re-checks this; failing here just gives a
  # clearer message before a browser is ever opened.
  [[ "$body" == *"\"supabaseHost\":\"sojmvhhwsjxmfistvzbe.supabase.co\""* ]]
}

if [[ "$mode" == "own" ]]; then
  if curl -fsS --max-time 3 "$base_url/" >/dev/null 2>&1; then
    # Refuse rather than attach to a stranger: something is already on the port
    # this run intended to own, and its tree is unknown.
    echo "Refusing to start: port $port is already serving. Set MYK9_AUDIT_REPLAY_PORT, or" >&2
    echo "pass PLAYWRIGHT_AUDIT_BASE_URL + PLAYWRIGHT_AUDIT_SERVER_ID to attach deliberately." >&2
    exit 1
  fi

  echo "Starting owned app server on port $port"
  # The HMR offset is why audit-judge-replay.ts caps the app port: this sum has
  # to stay a valid port. Keep both assignments on the command itself — a
  # trailing comment here swallows the line continuation and launches Vite with
  # neither variable, so the identity plugin never mounts.
  VITE_AUDIT_SERVER_ID="$server_id" VITE_HMR_PORT="$((port + 20000))" \
    pnpm exec vite --port "$port" --strictPort >/tmp/myk9-audit-judge-replay-server.log 2>&1 &
  server_pid=$!

  for _ in $(seq 1 60); do
    if identity_matches; then break; fi
    sleep 1
  done
fi

if ! identity_matches; then
  echo "The app server at $base_url did not identify itself as '$server_id'." >&2
  if [[ "$mode" == "own" ]]; then
    echo "--- server log ---" >&2
    tail -30 /tmp/myk9-audit-judge-replay-server.log >&2 || true
  fi
  exit 1
fi

echo "Verified app server identity; replaying judge scoring journey."

PLAYWRIGHT_AUDIT_BASE_URL="$base_url" \
PLAYWRIGHT_AUDIT_SERVER_ID="$server_id" \
PLAYWRIGHT_AUDIT_DATA_TARGET="$data_target" \
  pnpm exec playwright test \
    --config=playwright.audit.config.ts \
    --project="$project" \
    "${specs[@]}"

cat <<'SUMMARY'

Judge replay complete.

Evidence:
  test-results/audit-report/          HTML report (traces, screenshots, video)
  shared-staging-write-ledger.json    attached per test — every shared-staging
                                      write, and proof none was forwarded
SUMMARY

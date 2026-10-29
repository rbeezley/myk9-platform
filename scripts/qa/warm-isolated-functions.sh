#!/usr/bin/env bash
# MYK9-1467: boot the isolated stack's edge functions before the route sweep.
#
# The local edge runtime starts a function on its first call, and on a CI runner
# that first start can take longer than the sweep's 5 s settle window: the admin
# dashboard's sentry-dashboard-metrics call missed it on 2026-10-28 (run
# 40765490128) while every other request settled. Production keeps functions
# warm, so this is a harness cost, not a user-facing one.
#
# Warms the functions the app invokes that answer through the shared handle()
# wrapper, with a GET: handle() returns 405 to anything but OPTIONS/POST before
# auth, body or logic (_shared/http/handler.ts), so the request boots the worker
# and runs none of the function's code, and cannot change the seeded data the
# canaries read. A 405 proves the function itself answered; a CORS preflight does
# not, because the local gateway can answer one alone. Functions without handle()
# are skipped rather than trusted. Refuses a non-loopback target. Never fails the
# job: a function that does not warm is reported, and the sweep still judges it.
set -uo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

base="${VITE_SUPABASE_URL:-}"
case "$base" in
  http://127.0.0.1:* | http://localhost:*) ;;
  *)
    echo "warm-isolated-functions: refusing: VITE_SUPABASE_URL '${base}' is not a loopback stack" >&2
    exit 0
    ;;
esac

functions=()
while IFS= read -r name; do
  functions+=("$name")
done < <(
  # Whole-file match, so a call Prettier wrapped onto two lines still counts.
  find apps/myk9show/src packages/*/src \( -name '*.ts' -o -name '*.tsx' \) \
    ! -name '*.test.ts' ! -name '*.test.tsx' -print0 2>/dev/null |
    xargs -0 perl -0777 -ne \
      'print "$1\n" while /functions\.invoke(?:<.*?>)?\(\s*[\x27"]([a-z0-9-]+)[\x27"]/g' |
    sort -u |
    while IFS= read -r fn; do
      for dir in supabase/functions apps/myk9show/supabase/functions; do
        # `handle(` or `handle<...>(`, generics nested to any depth.
        if grep -qE '(^|[^.A-Za-z0-9_])handle(<.*>)?\(' "$dir/$fn/index.ts" 2>/dev/null; then
          echo "$fn"
          break
        fi
      done
    done
)

if [[ ${#functions[@]} -eq 0 ]]; then
  echo "warm-isolated-functions: found no handle() function the app invokes; nothing warmed" >&2
  exit 0
fi

echo "warm-isolated-functions: ${#functions[@]} handle() function(s) the app invokes, at ${base}"
warm_one() {
  local fn="$1"
  local out
  local key=()
  # The gateway may want the project's public anon key before it forwards.
  [[ -n "${VITE_SUPABASE_ANON_KEY:-}" ]] && key=(-H "apikey: ${VITE_SUPABASE_ANON_KEY}")
  # A worker still booting can answer 503; ask again until the function itself answers.
  local attempt
  for attempt in 1 2 3; do
    out="$(curl -s -o /dev/null -m 90 -X GET "${key[@]}" -w '%{http_code} %{time_total}' \
      "${base}/functions/v1/${fn}")"
    [[ "${out%% *}" == 405 ]] && break
    [[ $attempt -lt 3 ]] && sleep 2
  done
  # A second call shows whether the worker stayed up: with the per_worker policy
  # (isolated-e2e-functions.ts) it should answer far faster than the first.
  local again
  again="$(curl -s -o /dev/null -m 90 -X GET "${key[@]}" -w '%{http_code} %{time_total}' \
    "${base}/functions/v1/${fn}")"
  echo "  ${fn}: first ${out:-no answer}s (attempt ${attempt}), again ${again:-no answer}s (405 = answered)"
}
export -f warm_one
export base VITE_SUPABASE_ANON_KEY
printf '%s\n' "${functions[@]}" | xargs -P 4 -I{} bash -c 'warm_one "$1"' _ {}
exit 0

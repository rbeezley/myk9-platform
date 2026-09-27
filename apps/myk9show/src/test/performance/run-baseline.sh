#!/bin/sh
set -eu

cd "$(dirname "$0")/../../../../.."
playwright-cli open
if [ "${MYK9_PERF_SKIP_BUILD:-0}" != "1" ]; then
  pnpm --dir apps/myk9show build:production
fi

pnpm --dir apps/myk9show exec vite preview --host 127.0.0.1 --port 4173 --strictPort &
preview_pid=$!
cleanup() {
  kill "$preview_pid" 2>/dev/null || true
  wait "$preview_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

attempt=0
until curl --silent --fail http://127.0.0.1:4173/ >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "Production preview did not become ready on port 4173" >&2
    exit 1
  fi
  sleep 1
done

pnpm --dir apps/myk9show exec tsx src/test/performance/runBaseline.ts
pnpm --dir apps/myk9show exec tsx src/test/performance/addEntryComposition.ts
pnpm exec prettier --write docs/qa/perf-baseline-2026-09-26.md

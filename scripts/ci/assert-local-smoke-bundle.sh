#!/usr/bin/env bash
# MYK9-1449: browser smoke must never reach the live Supabase project. On
# 2026-10-27 one E2E PR Smoke run held production's p95 API latency at 4-5 s
# for real users for eight minutes. The smoke jobs now build the bundle
# against their own disposable local stack; this proves the built bundle
# agrees before any browser opens it.
#
#   VITE_SUPABASE_URL=<url> assert-local-smoke-bundle.sh <dist-dir>
#
# VITE_SUPABASE_URL is the loopback URL `pnpm qa:isolated-e2e:prepare` wrote
# into GITHUB_ENV, so the check asks for THAT stack, not any loopback URL.
#
# Exit 0: the bundle names that loopback URL and never the live project.
# Exit 1: it names the live project, or does not name that URL.
# Exit 2: usage error, a non-loopback VITE_SUPABASE_URL, or no JavaScript.
set -euo pipefail

LIVE_PROJECT_REF='sojmvhhwsjxmfistvzbe'

dist="${1:-}"
if [[ -z "$dist" || ! -d "$dist" ]]; then
  echo "usage: VITE_SUPABASE_URL=<url> $0 <dist-dir>" >&2
  exit 2
fi

target="${VITE_SUPABASE_URL:-}"
if [[ ! "$target" =~ ^https?://(127\.0\.0\.1|localhost):[0-9]+/?$ ]]; then
  echo "::error::VITE_SUPABASE_URL is not a loopback URL (got '${target}'); prepare the isolated target first" >&2
  exit 2
fi
target="${target%/}"

if ! find "$dist" -type f -name '*.js' -print -quit | grep -q .; then
  echo "::error::no JavaScript under $dist; nothing to check" >&2
  exit 2
fi

if grep -rlF --include='*.js' "$LIVE_PROJECT_REF" "$dist" >/dev/null; then
  echo "::error::the smoke bundle names the live Supabase project ($LIVE_PROJECT_REF):" >&2
  grep -rlF --include='*.js' "$LIVE_PROJECT_REF" "$dist" >&2
  exit 1
fi

if ! grep -rqF --include='*.js' "$target" "$dist"; then
  echo "::error::the smoke bundle does not name $target; was it built before the isolated target was prepared?" >&2
  exit 1
fi

echo "Smoke bundle targets $target, not $LIVE_PROJECT_REF."

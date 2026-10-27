#!/usr/bin/env bash
# MYK9-1449: browser smoke must never reach the live Supabase project. On
# 2026-10-27 one E2E PR Smoke run held production's p95 API latency at 4-5 s
# for real users for eight minutes. The smoke jobs now build the bundle
# against their own disposable local stack; this proves the built bundle
# agrees before any browser opens it.
#
#   assert-local-smoke-bundle.sh <dist-dir>
#
# Exit 0: the bundle names a loopback Supabase URL and never the live project.
# Exit 1: it names the live project, or names no loopback Supabase URL at all.
# Exit 2: usage error, or no JavaScript to check.
set -euo pipefail

LIVE_PROJECT_REF='sojmvhhwsjxmfistvzbe'

dist="${1:-}"
if [[ -z "$dist" || ! -d "$dist" ]]; then
  echo "usage: $0 <dist-dir>" >&2
  exit 2
fi

if ! find "$dist" -type f -name '*.js' -print -quit | grep -q .; then
  echo "::error::no JavaScript under $dist; nothing to check" >&2
  exit 2
fi

if grep -rlF --include='*.js' "$LIVE_PROJECT_REF" "$dist" >/dev/null; then
  echo "::error::the smoke bundle names the live Supabase project ($LIVE_PROJECT_REF):" >&2
  grep -rlF --include='*.js' "$LIVE_PROJECT_REF" "$dist" >&2
  exit 1
fi

if ! grep -rqE --include='*.js' 'https?://(127\.0\.0\.1|localhost):[0-9]+' "$dist"; then
  echo "::error::the smoke bundle names no loopback Supabase URL; was it built before the isolated target was prepared?" >&2
  exit 1
fi

echo "Smoke bundle targets the local Supabase stack, not $LIVE_PROJECT_REF."

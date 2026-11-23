#!/usr/bin/env bash
# Runs the repo's pinned Supabase CLI with the stored login token, from the
# current directory. Use it instead of bare `supabase`; why is in
# scripts/qa/supabase-cli.ts, the same rule for TypeScript callers (MYK9-1664).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin="$root/apps/myk9show/node_modules/.bin/supabase"
if [ ! -x "$bin" ]; then
  echo "scripts/supabase.sh: pinned CLI missing at $bin; run 'bash scripts/bootstrap-worktree.sh'" >&2
  exit 2
fi

token_file="$HOME/.supabase/access-token"
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ] && [ -s "$token_file" ]; then
  SUPABASE_ACCESS_TOKEN="$(tr -d '[:space:]' < "$token_file")"
  export SUPABASE_ACCESS_TOKEN
fi

exec "$bin" "$@"

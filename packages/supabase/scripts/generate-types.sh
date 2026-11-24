#!/usr/bin/env bash
# Regenerates src/types/database.types.ts through the pinned 3.x CLI wrapper.
# Output goes to a temp file that replaces the committed one only when the CLI
# succeeds, so a failed run never truncates it (MYK9-2335).
# MYK9_SUPABASE_RUNNER and MYK9_TYPES_OUT exist for the known-answer test.
set -euo pipefail

: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# An array, so a checkout path with a space (this repo's own) stays one argument.
if [ -n "${MYK9_SUPABASE_RUNNER:-}" ]; then
  runner=("$MYK9_SUPABASE_RUNNER")
else
  runner=(bash "$here/../../scripts/supabase.sh")
fi
out="${MYK9_TYPES_OUT:-$here/src/types/database.types.ts}"

tmp="$(mktemp "$out.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

if "${runner[@]}" gen types typescript --remote="$SUPABASE_PROJECT_ID" > "$tmp"; then
  mv "$tmp" "$out"
else
  status=$?
  echo "generate-types: CLI failed (exit $status); $out left untouched" >&2
  exit "$status"
fi

#!/usr/bin/env bash
# Report-only comparison of the committed Supabase types against the applied
# schema (MYK9-488). MYK9-484 found the committed file 28 objects behind the
# database because regeneration only ever happened when a developer needed a
# type; this makes the gap visible on every run without blocking anything.
#
# It must never block: a migration is applied by `supabase db push` AFTER its
# PR merges, so the migration PR can never carry matching types, and a blocking
# check would go red on every unrelated PR opened between the push and the
# regeneration. The workflow step carries `continue-on-error`.
#
# Usage:
#   scripts/qa/supabase-types-drift.sh [--committed <file>] [--generated <file>] [--summary <file>]
#
# Without --generated it runs `supabase gen types typescript --db-url` against
# MYK9_MIGRATION_DATABASE_URL, injecting PGPASSWORD when the URL carries no
# password. The generator needs Docker (it runs the postgres-meta image), so
# on the development Mac pass --generated with output from `--project-id`.
#
# Exit: 0 no drift · 1 drift (report-only) · 2 could not compare (not a verdict).
set -euo pipefail

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; }

COMMITTED="packages/supabase/src/types/database.types.ts"
GENERATED=""
SUMMARY="${GITHUB_STEP_SUMMARY:-}"
# A step summary is capped at 1 MiB; a full regeneration diff can be thousands
# of lines, so the report shows a readable head and says it truncated.
DIFF_LINE_CAP="${MYK9_TYPES_DRIFT_DIFF_LINES:-80}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --committed) COMMITTED="$2"; shift 2 ;;
    --generated) GENERATED="$2"; shift 2 ;;
    --summary) SUMMARY="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "supabase-types-drift: unknown argument $1" >&2; usage >&2; exit 2 ;;
  esac
done

warn() { echo "::warning title=Supabase types drift::$*"; }
not_a_verdict() { warn "did not run — $*"; echo "supabase-types-drift: $*" >&2; exit 2; }

[[ -f "$COMMITTED" ]] || not_a_verdict "committed file not found: $COMMITTED"

tmp="$(mktemp -d)"
cleanup() { rm -r -f -- "$tmp"; }
trap cleanup EXIT

if [[ -z "$GENERATED" ]]; then
  url="${MYK9_MIGRATION_DATABASE_URL:-}"
  [[ -n "$url" ]] || not_a_verdict "MYK9_MIGRATION_DATABASE_URL is unset and no --generated file was given"
  # `postgresql://user@host/...` carries no password; `postgresql://user:pw@host/...` does.
  if [[ -n "${PGPASSWORD:-}" && "$url" != *://*:*@* ]]; then
    encoded="$(jq -rn --arg p "$PGPASSWORD" '$p | @uri')"
    url="${url/@/:${encoded}@}"
  fi
  # `--db-url` emits every schema (public, graphql_public, storage, …) while the
  # committed file was generated with `--project-id`, which defaults to public.
  # Compare the schemas the committed file declares, or every storage helper
  # reads as "live but not committed" (first run of #2193).
  schemas="$(awk '
    /^export type Database = \{$/ { inside = 1; next }
    inside && /^\}$/               { exit }
    inside && /^  [A-Za-z0-9_]+: \{$/ && $1 != "__InternalSupabase:" { s = $1; sub(/:$/, "", s); print s }
  ' "$COMMITTED" | paste -sd, -)"
  [[ -n "$schemas" ]] || not_a_verdict "no schema headers found in $COMMITTED"
  GENERATED="$tmp/generated.ts"
  if ! supabase gen types typescript --db-url "$url" --schema "$schemas" > "$GENERATED" 2> "$tmp/gen.err"; then
    sed 's#://[^@]*@#://<redacted>@#g' "$tmp/gen.err" >&2 || true
    not_a_verdict "supabase gen types failed (see the step log)"
  fi
fi
[[ -s "$GENERATED" ]] || not_a_verdict "generated output is empty: $GENERATED"

# Drop the whole `__InternalSupabase` block from both sides. It is platform
# metadata, never schema: `PostgrestVersion` tracks the hosted project's
# PostgREST and moves on a CLI or platform upgrade. Filtering only the
# `PostgrestVersion:` line was not enough — `--db-url` has no project context,
# so whether the block is emitted at all depends on how the generator was
# invoked, and its two brace lines then read as schema drift nothing can fix.
strip_platform_metadata() {
  awk '
    /^  __InternalSupabase: \{$/ { skip = 1; next }
    skip && /^  \}$/             { skip = 0; next }
    !skip
  ' "$1"
}
strip_platform_metadata "$COMMITTED" > "$tmp/committed.ts"
strip_platform_metadata "$GENERATED" > "$tmp/generated.norm.ts"

# One line per object: <schema>.<section>.<name>, e.g. public.Tables.entries or
# public.Functions.get_show_judges. Tracks the 2-space schema and 4-space
# section headers so a name is never reported without its home. The object
# pattern must not anchor on `{` at end of line: an argument-less function is
# emitted on ONE line (`name: { Args: never; Returns: string[] }`).
object_headers() {
  awk '
    /^  [A-Za-z0-9_]+: \{$/    { schema = $1; sub(/:$/, "", schema); next }
    /^    [A-Za-z]+: \{$/      { section = $1; sub(/:$/, "", section); next }
    /^      [A-Za-z0-9_]+: \{/ { name = $1; sub(/:$/, "", name); print schema "." section "." name }
  ' "$1" | sort -u
}
object_headers "$tmp/committed.ts" > "$tmp/committed.objects"
object_headers "$tmp/generated.norm.ts" > "$tmp/generated.objects"

live_only="$(comm -13 "$tmp/committed.objects" "$tmp/generated.objects")"
committed_only="$(comm -23 "$tmp/committed.objects" "$tmp/generated.objects")"
line_delta="$(diff "$tmp/committed.ts" "$tmp/generated.norm.ts" | grep -c '^[<>]' || true)"
# `diff` exits 1 when the files differ, so every use of it here needs a guard:
# under `set -e` an unguarded call aborts the script, and inside the report
# block that abort produces a silently EMPTY summary rather than any error.
{ diff -U2 "$tmp/committed.ts" "$tmp/generated.norm.ts" || true; } | tail -n +3 > "$tmp/full.diff"

count() { if [[ -z "$1" ]]; then echo 0; else printf '%s\n' "$1" | wc -l | tr -d ' '; fi; }
as_list() {
  if [[ -z "$1" ]]; then echo "none"; else printf '%s\n' "$1" | sed 's/.*/`&`/' | paste -sd, - | sed 's/,/, /g'; fi
}

n_live="$(count "$live_only")"
n_committed="$(count "$committed_only")"

report="$tmp/report.md"
{
  echo "## Supabase types drift (report-only)"
  echo
  echo "Committed \`$COMMITTED\` vs \`supabase gen types\` against the applied schema, the \`__InternalSupabase\` platform block ignored."
  echo
  if [[ "$line_delta" == "0" ]]; then
    echo "**No drift.** The committed types match the applied schema."
  else
    echo "- **Live but not committed ($n_live):** $(as_list "$live_only")"
    echo "- **Committed but not live ($n_committed):** $(as_list "$committed_only")"
    echo "- **Line diff:** $line_delta lines changed"
    if [[ "$n_live" == "0" && "$n_committed" == "0" ]]; then
      echo "- No object was added or removed; the drift is inside existing objects (columns, arguments, relationships) or comes from a newer CLI."
    fi
    echo
    # Without this, a drift with no object-header change reports only a line
    # count, and nobody can tell a dropped column from generator churn without
    # a generator they may not be able to run (it needs Docker). MYK9-493 spent
    # a round trip on exactly that question.
    echo "<details><summary>Diff (committed → applied, first $DIFF_LINE_CAP lines)</summary>"
    echo
    echo '```diff'
    # `diff` exits 1 whenever the files differ, which is the only case that
    # reaches here — without the guard `set -e` kills the report mid-write and
    # the summary comes out empty.
    head -n "$DIFF_LINE_CAP" "$tmp/full.diff"
    if [[ "$(wc -l < "$tmp/full.diff" | tr -d ' ')" -gt "$DIFF_LINE_CAP" ]]; then
      echo "… truncated at $DIFF_LINE_CAP lines; regenerate locally to see the rest."
    fi
    echo '```'
    echo
    echo "</details>"
    echo
    echo "This check never blocks. Regenerate (db-push skill, Step 4):"
    echo
    echo '```bash'
    echo 'cd packages/supabase && SUPABASE_PROJECT_ID=sojmvhhwsjxmfistvzbe pnpm generate-types'
    echo 'cd ../.. && pnpm --filter @myk9/supabase build && pnpm typecheck --force'
    echo '```'
  fi
} > "$report"

cat "$report"
if [[ -n "$SUMMARY" ]]; then cat "$report" >> "$SUMMARY"; fi

if [[ "$line_delta" == "0" ]]; then
  exit 0
fi
warn "$n_live live object(s) not committed, $n_committed committed object(s) not live, $line_delta lines differ — regenerate packages/supabase/src/types/database.types.ts"
exit 1

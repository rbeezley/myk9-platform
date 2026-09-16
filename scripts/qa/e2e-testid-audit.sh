#!/usr/bin/env bash
# e2e-testid-audit.sh — find data-testid literals referenced by Playwright
# e2e specs/helpers that have no producer in the app source.
#
# Usage: scripts/qa/e2e-testid-audit.sh [--help]
#
# Extracts every getByTestId('...')/getByTestId("...") and
# data-testid="..." literal referenced under apps/myk9show/src/test/e2e/
# (specs and helpers), then checks each literal exists as a
# data-testid="<literal>" (or a data-testid={...} expression containing
# that literal) somewhere under apps/myk9show/src, excluding src/test.
# Prints one line per missing literal with the referencing file(s).
#
# This is a grep-based, best-effort audit (LESSONS dead-suite-reds): it
# cannot resolve dynamic testids built from template literals/variables
# on the app side, so it may under-report. It does not attempt to fix
# anything it finds — it only reports.

set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
E2E_DIR="$REPO_ROOT/apps/myk9show/src/test/e2e"
APP_SRC="$REPO_ROOT/apps/myk9show/src"

if [[ ! -d "$E2E_DIR" ]]; then
  echo "e2e-testid-audit: $E2E_DIR not found" >&2
  exit 2
fi

# file<TAB>literal for every reference found in specs + helpers
refs="$(grep -rnoE --include='*.ts' --include='*.tsx' \
  "getByTestId\(['\"][^'\"]+['\"]\)|data-testid=[\"'][^\"']+[\"']" "$E2E_DIR" \
  | sed -E "s/^([^:]+):[0-9]+:.*['\"]([^'\"]+)['\"].*/\1\t\2/")"

if [[ -z "$refs" ]]; then
  echo "e2e-testid-audit: no testid references found under $E2E_DIR"
  exit 0
fi

missing=0
total=0

# sort -u dedups (file, literal) pairs without needing bash 4 associative
# arrays (the system /bin/bash on this Mac is 3.2).
while IFS=$'\t' read -r file literal; do
  [[ -z "$literal" ]] && continue
  total=$((total + 1))

  if ! grep -rlF --include='*.ts' --include='*.tsx' -- "$literal" "$APP_SRC" \
      | grep -vF "$APP_SRC/test/" >/dev/null 2>&1; then
    missing=$((missing + 1))
    rel_file="${file#"$REPO_ROOT"/}"
    echo "MISSING: \"$literal\"  <-  $rel_file"
  fi
done <<<"$(sort -u <<<"$refs")"

echo "---"
echo "e2e-testid-audit: checked $total distinct (file, testid) reference(s); $missing missing"

[[ "$missing" -eq 0 ]]

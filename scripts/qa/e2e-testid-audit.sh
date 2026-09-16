#!/usr/bin/env bash
# e2e-testid-audit.sh — find data-testid literals referenced by Playwright
# e2e specs/helpers that have no producer in the app or package source.
#
# Usage:
#   scripts/qa/e2e-testid-audit.sh [--help|-h]
#   scripts/qa/e2e-testid-audit.sh --self-test
#
# Extracts every getByTestId('...')/getByTestId("...")/getByTestId(`...`),
# data-testid="..." (including inside a CSS-selector string such as
# `[data-testid="..."]`) and `testId: '...'` literal referenced under
# apps/myk9show/src/test/e2e/ (specs and helpers), then checks each
# literal is PRESENT in apps/myk9show/src (excluding src/test) or
# packages/*/src (excluding dist/node_modules/tests). A literal counts
# as present when, in a source file whose comments have been stripped
# and which contains the substring "data-testid" somewhere in that same
# file, the literal appears as any quoted string ('...'/"..."). This
# covers a plain data-testid="id" attribute, a data-testid={expr}
# expression that embeds the literal, and a TEST_IDS-style constant map
# used via data-testid={...} elsewhere in the same file. A literal that
# appears only inside a // line comment or a /* */ block comment does
# NOT count (both are stripped before either check runs; this stripping
# is not string-aware, so a `'https://...'` literal sharing a line with
# a data-testid reference could in principle be truncated at the `//` —
# measured inert against this repo today, but worth knowing).
#
# Every candidate captured by any of the three extraction patterns above
# passes through the same classify step before it can be compared against
# the present set: a token containing ${...} interpolation (a template
# literal, or a plain-quoted CSS-selector string that happens to embed
# one, e.g. `[data-testid="x-${y}"]`), or a bare variable/member-expression
# argument, is dynamic/unresolvable and is counted and reported as a
# single "N dynamic/unresolvable references skipped" line — never
# compared against the present set, never reported as MISSING.
#
# This asymmetry runs one way only: an APP-side data-testid built from an
# interpolated template literal (e.g. `wizard-step-circle-${step.id}`) is
# not resolvable either, but is not counted — a spec asserting a concrete
# instance of it (e.g. "wizard-step-circle-1") will read as MISSING. Read
# the referencing file before deleting anything this script flags.
#
# Exit codes: 0 = no missing references; 1 = at least one MISSING; 2 =
# could not run (no e2e dir, or zero statically-resolvable AND zero
# dynamic references found at all — nothing to check).
#
# --self-test builds a small fixture tree covering: a present attribute,
# an id present only in a // comment, an id present only in a /* */
# comment (both must be MISSING), a package-defined id, a constant-map
# id (present), a dynamic getByTestId template literal, and a dynamic
# data-testid CSS-selector template literal (both must be skipped, never
# MISSING). Exits 0 only if every case matches.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  sed -n '2,51p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
fi

# --- present-id extraction ------------------------------------------------
# Args: one or more root directories. Prints every quoted string literal
# found in a comment-stripped file that also contains "data-testid", one
# per line (not deduped; callers pipe through sort -u).
build_present_ids() {
  local roots=("$@") files=() root f
  for root in "${roots[@]}"; do
    [[ -d "$root" ]] || continue
    while IFS= read -r -d '' f; do files+=("$f"); done < <(
      find "$root" -type f \( -name '*.ts' -o -name '*.tsx' \) \
        ! -path '*/node_modules/*' ! -path '*/dist/*' ! -path '*/test/*' \
        ! -name '*.test.ts' ! -name '*.test.tsx' \
        ! -name '*.spec.ts' ! -name '*.spec.tsx' -print0
    )
  done
  [[ ${#files[@]} -eq 0 ]] && return 0
  perl -e '
    for my $file (@ARGV) {
      open(my $fh, "<", $file) or next;
      local $/;
      my $c = <$fh>;
      close $fh;
      $c =~ s{/\*.*?\*/}{}gs;
      $c =~ s{//[^\n]*}{}g;
      next unless $c =~ /data-testid/;
      while ($c =~ /["\x27]([A-Za-z0-9_-]+)["\x27]/g) { print "$1\n"; }
    }
  ' "${files[@]}"
}

# --- reference extraction --------------------------------------------------
# Args: one e2e root directory. Prints "REF\t<id>\t<file>" for every
# statically-resolvable reference and "DYN\t<file>" for every dynamic one.
# Every candidate captured by every pattern below is funneled through the
# single classify() sub before it can become a REF or a DYN line.
extract_references() {
  local root="$1" files=() f
  [[ -d "$root" ]] || return 0
  while IFS= read -r -d '' f; do files+=("$f"); done < <(
    find "$root" -type f \( -name '*.ts' -o -name '*.tsx' \) -print0
  )
  [[ ${#files[@]} -eq 0 ]] && return 0
  perl -e '
    # classify($token) -> ("lit", $value) | ("dyn")
    # $token is the raw captured text: a full quote/backtick-wrapped
    # literal, a bare (unwrapped) variable/expression, OR an already
    # quote-matched attribute value re-wrapped in its own quote char by
    # the caller. ${...} anywhere in the token means dynamic regardless
    # of wrapper, since it can only get there via an interpolated
    # template literal (including one disguised as a plain-quoted string
    # inside a backtick CSS selector).
    sub classify {
      my ($token) = @_;
      return ("dyn") if $token =~ /\$\{/;
      return ("lit", $1) if $token =~ /^\x27([^\x27]*)\x27$/;
      return ("lit", $1) if $token =~ /^"([^"]*)"$/;
      return ("lit", $1) if $token =~ /^`([^`]*)`$/;
      return ("dyn");
    }
    sub emit {
      my ($token, $file) = @_;
      my ($kind, $val) = classify($token);
      print $kind eq "lit" ? "REF\t$val\t$file\n" : "DYN\t$token\t$file\n";
    }
    for my $file (@ARGV) {
      open(my $fh, "<", $file) or next;
      local $/;
      my $c = <$fh>;
      close $fh;
      $c =~ s{/\*.*?\*/}{}gs;
      $c =~ s{//[^\n]*}{}g;
      while ($c =~ /getByTestId\(\s*(.*?)\s*\)/gs) {
        emit($1, $file);
      }
      # Quote-matched (backreferenced) so an embedded quote of the OTHER
      # kind (e.g. the \x27-\x27 inside a ${...} expression) does not
      # truncate the capture early; re-wrap in its own quote char and let
      # classify() decide (a stray ${ inside means dynamic).
      while ($c =~ /data-testid\s*=\s*(["\x27])((?:(?!\1).)*)\1/gs) {
        emit("$1$2$1", $file);
      }
      while ($c =~ /\btestId\s*:\s*(.*?)\s*[,\n\}]/gs) {
        emit($1, $file);
      }
    }
  ' "${files[@]}"
}

# --- core run ---------------------------------------------------------------
run_audit() {
  local e2e_dir="$1"
  shift
  local app_roots=("$@")

  if [[ ! -d "$e2e_dir" ]]; then
    echo "e2e-testid-audit: $e2e_dir not found" >&2
    return 2
  fi

  local present_file refs_file ref_ids_file missing_ids_file
  present_file="$(mktemp)"; refs_file="$(mktemp)"
  ref_ids_file="$(mktemp)"; missing_ids_file="$(mktemp)"
  trap 'rm -f "$present_file" "$refs_file" "$ref_ids_file" "$missing_ids_file"' RETURN

  build_present_ids "${app_roots[@]}" | sort -u > "$present_file"
  extract_references "$e2e_dir" | sed "s|$REPO_ROOT/||g" | sort -u > "$refs_file"

  local dynamic_count total_refs
  dynamic_count=$(awk -F'\t' '$1=="DYN"' "$refs_file" | wc -l | tr -d ' ')
  total_refs=$(awk -F'\t' '$1=="REF"' "$refs_file" | wc -l | tr -d ' ')

  if [[ "$total_refs" -eq 0 && "$dynamic_count" -eq 0 ]]; then
    echo "e2e-testid-audit: no testid references found under $e2e_dir"
    return 2
  fi

  awk -F'\t' '$1=="REF"{print $2}' "$refs_file" | sort -u > "$ref_ids_file"
  comm -23 "$ref_ids_file" "$present_file" > "$missing_ids_file"

  local missing_output missing_count=0
  missing_output=$(awk -F'\t' '
    NR==FNR { miss[$1]=1; next }
    $1=="REF" && ($2 in miss) { print "MISSING: \"" $2 "\"  <-  " $3 }
  ' "$missing_ids_file" "$refs_file")

  if [[ -n "$missing_output" ]]; then
    echo "$missing_output"
    missing_count=$(printf '%s\n' "$missing_output" | wc -l | tr -d ' ')
  fi

  echo "---"
  echo "e2e-testid-audit: checked $total_refs distinct (file, testid) reference(s); $dynamic_count dynamic/unresolvable reference(s) skipped; $missing_count missing"

  [[ "$missing_count" -eq 0 ]]
}

# --- self-test ---------------------------------------------------------------
build_self_test_fixture() {
  local tmp="$1" app_root pkg_root e2e_root
  app_root="$tmp/app/src"
  pkg_root="$tmp/packages/pkg/src"
  e2e_root="$app_root/test/e2e"
  mkdir -p "$app_root/components" "$pkg_root/components" "$e2e_root"

  cat > "$app_root/components/Present.tsx" <<'EOF'
export const Present = () => <div data-testid="present-attr">x</div>;
// a "line-comment-id" must NOT count as present
EOF

  cat > "$app_root/components/BlockComment.tsx" <<'EOF'
/* a "block-comment-id" must NOT count as present */
export const Other = () => <div data-testid="other-attr">x</div>;
EOF

  cat > "$app_root/components/ConstMap.tsx" <<'EOF'
export const IDS = { foo: 'const-map-id' };
export const Widget = () => <div data-testid={IDS.foo}>x</div>;
EOF

  cat > "$pkg_root/components/PkgWidget.tsx" <<'EOF'
export const PkgWidget = () => <div data-testid="pkg-id">x</div>;
EOF

  cat > "$e2e_root/fixture.spec.ts" <<'EOF'
import { test } from '@playwright/test';
test('fixture', async ({ page }) => {
  await page.getByTestId('present-attr').click();
  await page.getByTestId('line-comment-id').click();
  await page.getByTestId('block-comment-id').click();
  await page.getByTestId('pkg-id').click();
  await page.getByTestId('const-map-id').click();
  const id = 'dog-1';
  await page.getByTestId(`dog-${id}`).click();
  const className = 'x';
  const dynSelector = `[data-testid="x-${className}"]`;
  await page.locator(dynSelector).click();
});
EOF
}

run_self_test() {
  local tmp app_root pkg_root e2e_root ok=1 r
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  app_root="$tmp/app/src"
  pkg_root="$tmp/packages/pkg/src"
  e2e_root="$app_root/test/e2e"

  build_self_test_fixture "$tmp"

  local present_file refs_file
  present_file="$(mktemp)"; refs_file="$(mktemp)"

  build_present_ids "$app_root" "$pkg_root" | sort -u > "$present_file"
  extract_references "$e2e_root" | sort -u > "$refs_file"

  check() {
    local desc="$1" cond="$2"
    if [[ "$cond" -eq 0 ]]; then
      echo "self-test: PASS - $desc"
    else
      echo "self-test: FAIL - $desc"
      ok=0
    fi
  }

  grep -qx "present-attr" "$present_file" && r=0 || r=1
  check "present attribute is present" "$r"

  grep -qx "line-comment-id" "$present_file" && r=1 || r=0
  check "// line-comment-only id is NOT present" "$r"

  grep -qx "block-comment-id" "$present_file" && r=1 || r=0
  check "/* */ block-comment-only id is NOT present" "$r"

  grep -qx "pkg-id" "$present_file" && r=0 || r=1
  check "package-defined id is present" "$r"

  grep -qx "const-map-id" "$present_file" && r=0 || r=1
  check "constant-map id is present" "$r"

  grep -q '^DYN	' "$refs_file" && r=0 || r=1
  check "at least one dynamic reference is skipped" "$r"

  grep -qE '^REF\t(dog-\$\{id\}|dog-1)\t' "$refs_file" && r=1 || r=0
  check "getByTestId template literal is not a static REF" "$r"

  grep -qE '^REF\tx-' "$refs_file" && r=1 || r=0
  check "data-testid CSS-selector template literal is not a static REF" "$r"

  rm -f "$present_file" "$refs_file"
  [[ "$ok" -eq 1 ]]
}

if [[ "${1:-}" == "--self-test" ]]; then
  run_self_test
  exit $?
fi

# Guard so this file can be sourced (e.g. by a test harness) without
# running the real audit against the live repo.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  E2E_DIR="$REPO_ROOT/apps/myk9show/src/test/e2e"
  APP_ROOTS=("$REPO_ROOT/apps/myk9show/src")
  for d in "$REPO_ROOT"/packages/*/src; do
    [[ -d "$d" ]] && APP_ROOTS+=("$d")
  done
  run_audit "$E2E_DIR" "${APP_ROOTS[@]}"
fi

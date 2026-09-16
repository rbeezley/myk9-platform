#!/usr/bin/env bash
# e2e-testid-audit.sh — find data-testid literals referenced by Playwright
# e2e specs/helpers that have no producer in the app or package source.
#
# Usage:
#   scripts/qa/e2e-testid-audit.sh [--help|-h]
#   scripts/qa/e2e-testid-audit.sh --self-test
#
# Extracts every getByTestId('...')/getByTestId("...")/getByTestId(`...`),
# data-testid="..." and `testId: '...'` literal referenced under
# apps/myk9show/src/test/e2e/ (specs and helpers), then checks each
# literal is PRESENT in apps/myk9show/src (excluding src/test) or
# packages/*/src (excluding dist/node_modules/tests). A literal counts
# as present when, in a source file whose comments have been stripped
# and which contains the substring "data-testid" somewhere in that same
# file, the literal appears as any quoted string ('...'/"..."). This
# covers a plain data-testid="id" attribute, a data-testid={expr}
# expression that embeds the literal, and a TEST_IDS-style constant map
# used via data-testid={...} elsewhere in the same file. A literal that
# appears only inside a comment does NOT count (comments are stripped
# before either check runs).
#
# References built from a template literal with ${...} interpolation, or
# from a bare variable/member-expression argument, cannot be resolved
# statically; they are counted and reported as a single "N
# dynamic/unresolvable references skipped" line, never as MISSING.
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
# an id present only in a comment (must be MISSING), a package-defined
# id, a dynamic template literal (must be skipped, not MISSING), and a
# constant-map id (must be present). Exits 0 only if every case matches.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  sed -n '2,41p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
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
extract_references() {
  local root="$1" files=() f
  [[ -d "$root" ]] || return 0
  while IFS= read -r -d '' f; do files+=("$f"); done < <(
    find "$root" -type f \( -name '*.ts' -o -name '*.tsx' \) -print0
  )
  [[ ${#files[@]} -eq 0 ]] && return 0
  perl -e '
    sub classify {
      my ($arg) = @_;
      return ("lit", $1) if $arg =~ /^\x27([^\x27]*)\x27$/;
      return ("lit", $1) if $arg =~ /^"([^"]*)"$/;
      if ($arg =~ /^`([^`]*)`$/) {
        my $t = $1;
        return ("dyn") if $t =~ /\$\{/;
        return ("lit", $t);
      }
      return ("dyn");
    }
    for my $file (@ARGV) {
      open(my $fh, "<", $file) or next;
      local $/;
      my $c = <$fh>;
      close $fh;
      $c =~ s{/\*.*?\*/}{}gs;
      $c =~ s{//[^\n]*}{}g;
      while ($c =~ /getByTestId\(\s*(.*?)\s*\)/gs) {
        my ($kind, $val) = classify($1);
        print $kind eq "lit" ? "REF\t$val\t$file\n" : "DYN\t$file\n";
      }
      while ($c =~ /data-testid\s*=\s*["\x27]([^"\x27]+)["\x27]/g) {
        print "REF\t$1\t$file\n";
      }
      while ($c =~ /\btestId\s*:\s*(.*?)\s*[,\n\}]/gs) {
        my ($kind, $val) = classify($1);
        print $kind eq "lit" ? "REF\t$val\t$file\n" : "DYN\t$file\n";
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
run_self_test() {
  local tmp app_root pkg_root e2e_root ok=1 r
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  app_root="$tmp/app/src"
  pkg_root="$tmp/packages/pkg/src"
  e2e_root="$app_root/test/e2e"
  mkdir -p "$app_root/components" "$pkg_root/components" "$e2e_root"

  cat > "$app_root/components/Present.tsx" <<'EOF'
export const Present = () => <div data-testid="present-attr">x</div>;
// a comment mentioning coincidental-substring must NOT count as present
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
  await page.getByTestId('coincidental-substring').click();
  await page.getByTestId('pkg-id').click();
  await page.getByTestId('const-map-id').click();
  const id = 'dog-1';
  await page.getByTestId(`dog-${id}`).click();
});
EOF

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

  grep -qx "coincidental-substring" "$present_file" && r=1 || r=0
  check "comment-only id is NOT present" "$r"

  grep -qx "pkg-id" "$present_file" && r=0 || r=1
  check "package-defined id is present" "$r"

  grep -qx "const-map-id" "$present_file" && r=0 || r=1
  check "constant-map id is present" "$r"

  grep -q '^DYN	' "$refs_file" && r=0 || r=1
  check "template literal with interpolation is skipped as dynamic" "$r"

  grep -qE 'dog-\$\{id\}|dog-1' "$refs_file" && r=1 || r=0
  check "dynamic template literal is not treated as a static REF" "$r"

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

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
# Those concrete instances are exempted by the sidecar allowlist
# scripts/qa/e2e-testid-audit.allowlist: one tab-separated row per id,
#   <id> TAB <producer path, repo-relative> TAB <template> TAB <reason>
# where <template> is the exact template text the producer interpolates,
# e.g. result-${opt.value}. A row is honoured only while it is true: the
# producer file exists, contains "data-testid" and the template text
# verbatim, the id matches the template (each ${...} = one or more
# characters), some e2e file still references the id, and the id is not
# already statically present. Any row that fails one of those is reported
# as STALE ALLOWLIST and fails the run, so an exemption cannot outlive the
# code it describes.
#
# Exit codes: 0 = no missing references and no stale allowlist rows; 1 =
# at least one MISSING or STALE ALLOWLIST; 2 = could not run (no e2e dir,
# or zero statically-resolvable AND zero dynamic references found at all —
# nothing to check).
#
# --self-test builds a small fixture tree covering: a present attribute,
# an id present only in a // comment, an id present only in a /* */
# comment (both must be MISSING), a package-defined id, a constant-map
# id (present), a dynamic getByTestId template literal, and a dynamic
# data-testid CSS-selector template literal (both must be skipped, never
# MISSING); then runs the whole audit against a second fixture to prove an
# honoured allowlist row passes and each stale-row shape fails. Exits 0
# only if every case matches.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Overridden by --self-test to point at its fixture tree.
AUDIT_ALLOWLIST="$SCRIPT_DIR/e2e-testid-audit.allowlist"
AUDIT_PRODUCER_ROOT="$REPO_ROOT"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  sed -n '2,66p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
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

# --- allowlist ---------------------------------------------------------------
# Args: allowlist file, producer root, referenced-ids file, present-ids file.
# Prints "ALLOW\t<id>" for every honoured row and
# "STALE\t<line>\t<id>\t<why>" for every row that no longer holds.
check_allowlist() {
  local allowlist="$1" root="$2" ref_ids="$3" present_ids="$4"
  [[ -f "$allowlist" ]] || return 0
  perl -e '
    my ($allowlist, $root, $ref_ids, $present_ids) = @ARGV;
    my (%ref, %present);
    for ([$ref_ids, \%ref], [$present_ids, \%present]) {
      my ($path, $set) = @$_;
      open(my $fh, "<", $path) or die "cannot read $path";
      while (<$fh>) { chomp; $set->{$_} = 1; }
    }
    open(my $fh, "<", $allowlist) or die "cannot read $allowlist";
    my $n = 0;
    while (my $line = <$fh>) {
      $n++;
      chomp $line;
      next if $line =~ /^\s*(#|$)/;
      my @f = split /\t/, $line, -1;
      my $id = $f[0] // "";
      my $stale = sub { print "STALE\t$n\t$id\t$_[0]\n"; };
      if (@f != 4 || grep { $_ eq "" } @f) {
        $stale->("expected 4 non-empty tab-separated fields: id, producer, template, reason");
        next;
      }
      my (undef, $producer, $template) = @f;
      my $path = "$root/$producer";
      my $src;
      if (open(my $pf, "<", $path)) { local $/; $src = <$pf>; close $pf; }
      if (!defined $src) { $stale->("producer $producer does not exist"); next; }
      if (index($src, "data-testid") < 0) { $stale->("producer $producer has no data-testid"); next; }
      if (index($src, $template) < 0) { $stale->("producer $producer no longer contains template $template"); next; }
      if ($template !~ /\$\{/) { $stale->("template $template has no \${...} interpolation"); next; }
      my $re = join "", map { /^\$\{/ ? ".+" : quotemeta($_) } split /(\$\{[^}]*\})/, $template;
      if ($id !~ /^$re$/) { $stale->("id does not match template $template"); next; }
      if (!$ref{$id}) { $stale->("no e2e file references this id any more"); next; }
      if ($present{$id}) { $stale->("id is statically present; the row is redundant"); next; }
      print "ALLOW\t$id\n";
    }
  ' "$allowlist" "$root" "$ref_ids" "$present_ids"
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

  local allow_output allowed_count stale_output stale_count=0
  allow_output=$(check_allowlist "$AUDIT_ALLOWLIST" "$AUDIT_PRODUCER_ROOT" "$ref_ids_file" "$present_file")
  allowed_count=$(printf '%s\n' "$allow_output" | awk -F'\t' '$1=="ALLOW"' | wc -l | tr -d ' ')
  stale_output=$(printf '%s\n' "$allow_output" | awk -F'\t' '
    $1=="STALE" { print "STALE ALLOWLIST: line " $2 " \"" $3 "\": " $4 }
  ')

  # Honoured allowlist ids count as present.
  printf '%s\n' "$allow_output" | awk -F'\t' '$1=="ALLOW"{print $2}' \
    | cat - "$present_file" | sort -u | comm -23 "$ref_ids_file" - > "$missing_ids_file"

  local missing_output missing_count=0
  missing_output=$(awk -F'\t' '
    NR==FNR { miss[$1]=1; next }
    $1=="REF" && ($2 in miss) { print "MISSING: \"" $2 "\"  <-  " $3 }
  ' "$missing_ids_file" "$refs_file")

  if [[ -n "$missing_output" ]]; then
    echo "$missing_output"
    missing_count=$(printf '%s\n' "$missing_output" | wc -l | tr -d ' ')
  fi
  if [[ -n "$stale_output" ]]; then
    echo "$stale_output"
    stale_count=$(printf '%s\n' "$stale_output" | wc -l | tr -d ' ')
  fi

  echo "---"
  echo "e2e-testid-audit: checked $total_refs distinct (file, testid) reference(s); $dynamic_count dynamic/unresolvable reference(s) skipped; $allowed_count allowlisted; $missing_count missing; $stale_count stale allowlist row(s)"

  [[ "$missing_count" -eq 0 && "$stale_count" -eq 0 ]]
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

  # Allowlist: a second, otherwise-clean fixture run through the whole audit.
  local atmp aapp ae2e allow out rc
  atmp="$tmp/allow"
  aapp="$atmp/app/src"
  ae2e="$aapp/test/e2e"
  allow="$atmp/allowlist"
  mkdir -p "$aapp/components" "$ae2e"
  cat > "$aapp/components/Chips.tsx" <<'EOF'
export const Chips = ({ v }: { v: string }) => <button data-testid={`chip-${v}`}>x</button>;
export const Plain = () => <div data-testid="plain-id">x</div>;
export const Row = ({ k }: { k: string }) => <div data-testid={`plain-${k}`}>x</div>;
EOF
  cat > "$ae2e/allow.spec.ts" <<'EOF'
import { test } from '@playwright/test';
test('allow', async ({ page }) => {
  await page.getByTestId('chip-A').click();
  await page.getByTestId('plain-id').click();
});
EOF

  # run_one <allowlist body>: runs the audit in a subshell, sets $out and $rc.
  run_one() {
    printf '%b' "$1" > "$allow"
    set +e
    out=$(AUDIT_ALLOWLIST="$allow" AUDIT_PRODUCER_ROOT="$atmp" run_audit "$ae2e" "$aapp" 2>&1)
    rc=$?
    set -e
  }
  local producer="app/src/components/Chips.tsx"

  run_one ""
  [[ "$rc" -eq 1 && "$out" == *'MISSING: "chip-A"'* ]] && r=0 || r=1
  check "interpolated id with no allowlist row is MISSING" "$r"

  run_one "# comment\n\nchip-A\t$producer\tchip-\${v}\tdynamic chip\n"
  [[ "$rc" -eq 0 && "$out" == *"1 allowlisted"* ]] && r=0 || r=1
  check "honoured allowlist row exempts the id and the run passes" "$r"

  run_one "chip-A\t$producer\tchip-\${v}\tok\nchip-Z\t$producer\tchip-\${v}\tunreferenced\n"
  [[ "$rc" -eq 1 && "$out" == *'STALE ALLOWLIST: line 2 "chip-Z": no e2e file references'* ]] && r=0 || r=1
  check "row for an id no e2e file references is STALE" "$r"

  run_one "chip-A\t$producer\tpill-\${v}\twrong template\n"
  [[ "$rc" -eq 1 && "$out" == *"no longer contains template"* ]] && r=0 || r=1
  check "row whose template is gone from the producer is STALE" "$r"

  run_one "chip-A\tapp/src/components/Gone.tsx\tchip-\${v}\tmoved\n"
  [[ "$rc" -eq 1 && "$out" == *"does not exist"* ]] && r=0 || r=1
  check "row whose producer file is gone is STALE" "$r"

  run_one "chip-A\t$producer\tplain-id\tno interpolation\n"
  [[ "$rc" -eq 1 && "$out" == *"has no \${...} interpolation"* ]] && r=0 || r=1
  check "row whose template has no interpolation is STALE" "$r"

  run_one "plain-id\t$producer\tchip-\${v}\tmismatch\nchip-A\t$producer\tchip-\${v}\tok\n"
  [[ "$rc" -eq 1 && "$out" == *'"plain-id": id does not match template'* ]] && r=0 || r=1
  check "row whose id does not match its template is STALE" "$r"

  run_one "chip-A\t$producer\tchip-\${v}\tok\nplain-id\t$producer\tplain-\${k}\tredundant\n"
  [[ "$rc" -eq 1 && "$out" == *'"plain-id": id is statically present'* ]] && r=0 || r=1
  check "row for a statically present id is STALE (redundant)" "$r"

  run_one "chip-A\t$producer\tchip-\${v}\n"
  [[ "$rc" -eq 1 && "$out" == *"expected 4 non-empty"* ]] && r=0 || r=1
  check "row missing its reason is STALE" "$r"

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

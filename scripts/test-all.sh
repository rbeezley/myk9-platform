#!/bin/bash
# Fast parallel test runner for the myk9 monorepo
# Runs each test file individually with a timeout to prevent hangs
# Usage: ./scripts/test-all.sh [app]  (app = myk9show | myk9q | all)

set -e

APP="${1:-all}"
TIMEOUT_SECS="${2:-30}"
RESULTS_FILE="/tmp/myk9_test_results.txt"
> "$RESULTS_FILE"

PASS=0
FAIL=0
HANG=0
FAIL_LIST=""

run_app_tests() {
  local app_dir="$1"
  local app_name="$2"

  echo "━━━ Testing $app_name ━━━"

  cd "$app_dir"

  local files
  files=$(find src -name "*.test.ts" -o -name "*.test.tsx" | sort)
  local total
  total=$(echo "$files" | wc -l | tr -d ' ')
  local count=0

  for testfile in $files; do
    count=$((count + 1))

    # Run with timeout
    if timeout "$TIMEOUT_SECS" npx vitest run "$testfile" --reporter=dot >/dev/null 2>&1; then
      STATUS="PASS"
      PASS=$((PASS + 1))
      printf "\r  [%d/%d] ✓ %s\033[K\n" "$count" "$total" "$testfile"
    else
      EXIT_CODE=$?
      if [ $EXIT_CODE -eq 124 ]; then
        STATUS="HANG"
        HANG=$((HANG + 1))
        printf "\r  [%d/%d] ⏱ HANG %s\033[K\n" "$count" "$total" "$testfile"
      else
        STATUS="FAIL"
        FAIL=$((FAIL + 1))
        printf "\r  [%d/%d] ✗ FAIL %s\033[K\n" "$count" "$total" "$testfile"
      fi
      FAIL_LIST="$FAIL_LIST\n  $app_name: $testfile ($STATUS)"
    fi

    echo "$STATUS $app_name/$testfile" >> "$RESULTS_FILE"
  done
}

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$APP" = "all" ] || [ "$APP" = "myk9show" ]; then
  run_app_tests "$REPO_ROOT/apps/myk9show" "myk9show"
fi

if [ "$APP" = "all" ] || [ "$APP" = "myk9q" ]; then
  run_app_tests "$REPO_ROOT/apps/myk9q" "myk9q"
fi

echo ""
echo "━━━ Results ━━━"
echo "  Pass: $PASS"
echo "  Fail: $FAIL"
echo "  Hang: $HANG"

if [ $FAIL -gt 0 ] || [ $HANG -gt 0 ]; then
  echo ""
  echo "Failures:"
  printf "$FAIL_LIST\n"
  exit 1
fi

echo "  All tests passed!"

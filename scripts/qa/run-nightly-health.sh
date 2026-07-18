#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [[ -f .qa-nightly.env ]]; then
  # The isolated preparation script supplies a unique app/HMR port here.
  source .qa-nightly.env
fi

echo '=== Nightly health: deterministic Vitest ==='
pnpm --dir apps/myk9show exec vitest run \
  src/test/unit/entryStore.multiClass.test.ts \
  src/test/services/entries/entryLimitChecker.waitlists.test.ts \
  src/test/services/APIErrorInterceptor.registrationRecovery.test.ts \
  src/hooks/useInfiniteScroll.performanceCaching.test.ts

echo '=== Nightly health: read-only route health ==='
pnpm --dir apps/myk9show test:e2e:clean \
  src/test/e2e/route-health-by-role.spec.ts \
  --project=chromium --workers=1 --timeout=90000 --retries=0

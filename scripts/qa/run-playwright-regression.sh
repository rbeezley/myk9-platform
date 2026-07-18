#!/usr/bin/env bash
set -euo pipefail

if [[ "${MYK9_PLAYWRIGHT_REGRESSION_ENABLED:-}" != 'true' || "${MYK9_PLAYWRIGHT_REGRESSION_TARGET:-}" != 'isolated' ]]; then
  cat >&2 <<'MESSAGE'
Refusing to run the stateful Playwright regression suite.

Set MYK9_PLAYWRIGHT_REGRESSION_ENABLED=true and
MYK9_PLAYWRIGHT_REGRESSION_TARGET=isolated only when the configured target uses
isolated/resettable E2E data and the required shared-system approval is in
place.
MESSAGE
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

pnpm exec tsx scripts/qa/verify-isolated-e2e-target.ts

pnpm --dir apps/myk9show test:e2e:regression -- \
  --fail-on-flaky-tests --workers=1 --retries=0

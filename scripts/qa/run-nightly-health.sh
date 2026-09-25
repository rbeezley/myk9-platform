#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [[ -f .qa-nightly.env ]]; then
  # The isolated preparation script supplies a unique app/HMR port here.
  source .qa-nightly.env
fi

# Browser projects for the route-health sweep. Comma-separated, matching project
# names in apps/myk9show/playwright.config.ts. Defaults to chromium so the
# blocking nightly job's behaviour is unchanged; the advisory cross-browser job
# in .github/workflows/nightly-health.yml overrides it.
NIGHTLY_HEALTH_PROJECTS="${MYK9_NIGHTLY_HEALTH_PROJECTS:-chromium}"

# Set to 'true' to run only the route-health sweep. The deterministic Vitest
# block is browser-independent, so re-running it once per browser would burn
# minutes to assert the same thing twice.
SKIP_VITEST="${MYK9_NIGHTLY_HEALTH_SKIP_VITEST:-false}"

project_args=()
IFS=',' read -ra requested_projects <<<"$NIGHTLY_HEALTH_PROJECTS"
for project in "${requested_projects[@]}"; do
  # Trim surrounding whitespace so 'webkit, mobile-safari' works too.
  project="${project#"${project%%[![:space:]]*}"}"
  project="${project%"${project##*[![:space:]]}"}"
  [[ -n "$project" ]] && project_args+=("--project=$project")
done

if [[ ${#project_args[@]} -eq 0 ]]; then
  echo "MYK9_NIGHTLY_HEALTH_PROJECTS resolved to no projects" >&2
  exit 2
fi

if [[ "$SKIP_VITEST" != 'true' ]]; then
  echo '=== Nightly health: deterministic Vitest ==='
  pnpm --dir apps/myk9show exec vitest run \
    src/test/unit/entryStore.multiClass.test.ts \
    src/test/services/APIErrorInterceptor.registrationRecovery.test.ts \
    src/hooks/useInfiniteScroll.performanceCaching.test.ts
fi

# walkRegressionCanaries pins walk-verified fixes against live shared staging
# (MYK9-730). Read-only; a canary with no qualifying row skips with a
# staging-data-absent annotation rather than failing the gate.
echo "=== Nightly health: read-only route health + walk canaries (${NIGHTLY_HEALTH_PROJECTS}) ==="
pnpm --dir apps/myk9show test:e2e:clean \
  src/test/e2e/route-health-by-role.spec.ts \
  src/test/e2e/walkRegressionCanaries.spec.ts \
  "${project_args[@]}" --workers=1 --timeout=90000 --retries=0

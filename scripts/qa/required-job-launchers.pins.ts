/**
 * The pinned data for `required-job-launchers.ts` (split out to keep that module under the
 * file-size limit). Every package script and raw `pnpm` invocation the required CI jobs run,
 * pinned verbatim. This file lives under `scripts/qa/`, so it floors at `independent` like
 * the module that reads it.
 */
/** A `pnpm <script>` invocation resolved to the package.json that defines it. */
export interface PinnedScript {
  /** Workspace-relative directory of the owning package.json. */
  readonly pkgDir: string;
  readonly script: string;
  /** The command text the script must still resolve to. */
  readonly command: string;
}

/**
 * Every `pnpm <script>` a required job invokes, with the command it must still
 * resolve to. Repointing any of these at `true` turns the contract test red.
 */
export const PINNED_SCRIPTS: readonly PinnedScript[] = [
  {
    pkgDir: '.',
    script: 'typecheck',
    command: 'pnpm run typecheck:scripts && turbo typecheck',
  },
  {
    pkgDir: '.',
    script: 'qa:typecheck-scripts:test',
    command: 'vitest run scripts/qa/typecheck-scripts.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:deferred-reviews:test',
    command:
      'vitest run scripts/qa/deferred-reviews.test.ts scripts/qa/deferred-reviews.window.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:issue-janitor:test',
    command:
      'vitest run scripts/qa/issue-janitor.test.ts scripts/qa/issue-janitor-readers.test.ts scripts/qa/issue-janitor-branches.test.ts',
  },
  { pkgDir: '.', script: 'lint', command: 'eslint scripts && turbo lint' },
  {
    pkgDir: '.',
    script: 'format:check:changed',
    command: 'bash scripts/qa/format-changed.sh --check origin/main',
  },
  { pkgDir: 'apps/myk9show', script: 'test:load:unit', command: 'vitest run src/test/load' },
  {
    pkgDir: 'apps/myk9show',
    script: 'test:load:list',
    command: 'playwright test --config=playwright.load.config.ts --list',
  },
  {
    pkgDir: '.',
    script: 'qa:browser-session:test',
    command: 'tsx --test scripts/qa/browser-session.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:nightly:workflow:test',
    command:
      'vitest run scripts/qa/nightly-health-workflow.test.ts scripts/qa/nightly-isolation-cleanup.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:backups:typecheck',
    command: 'tsc --noEmit -p scripts/backup/tsconfig.json',
  },
  {
    pkgDir: '.',
    script: 'qa:backups:test',
    command: 'vitest run scripts/backup --sequence.shuffle',
  },
  { pkgDir: '.', script: 'qa:e2e-map:check', command: 'node scripts/check-e2e-suite-map.js' },
  { pkgDir: '.', script: 'qa:e2e-testid-audit', command: 'bash scripts/qa/e2e-testid-audit.sh' },
  {
    pkgDir: '.',
    script: 'qa:sql:behavioral:test',
    command:
      'vitest run scripts/qa/run-behavioral-sql-tests.test.ts scripts/qa/run-sql-local.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:pr-checks:test',
    command: 'vitest run scripts/qa/watch-pr-checks.test.ts',
  },
  { pkgDir: '.', script: 'qa:pr-checks', command: 'bash scripts/qa/watch-pr-checks.sh' },
  {
    pkgDir: '.',
    script: 'qa:ci-coverage-gate:test',
    command: 'vitest run scripts/qa/ci-coverage-gate.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:gating-jobs:test',
    command: 'vitest run scripts/qa/evaluate-gating-jobs.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:bulk-pii:test',
    command: 'vitest run scripts/qa/check-bulk-pii.test.ts',
  },
  { pkgDir: '.', script: 'qa:bulk-pii', command: 'tsx scripts/qa/check-bulk-pii.ts' },
  {
    pkgDir: '.',
    script: 'qa:review-gate:test',
    command: 'vitest run scripts/qa/review-gate.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:review-tier:test',
    command: 'vitest run scripts/qa/review-tier.test.ts scripts/qa/optional-review-inputs.test.ts',
  },
  // This pin's own contract test. Self-covering on purpose: dropping the CI
  // step that runs it is itself a drift the pin reports.
  {
    pkgDir: '.',
    script: 'qa:launcher-pin:test',
    command: 'vitest run scripts/qa/required-job-launchers.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:codex-review:test',
    command:
      'vitest run scripts/qa/codex-review.test.ts scripts/qa/codex-review.rounds.test.ts scripts/qa/review-contract.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:post-review-gate:test',
    command:
      'vitest run scripts/qa/post-review-gate.test.ts scripts/qa/post-review-gate.coverage.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:claude-review:test',
    command: 'vitest run scripts/qa/claude-review.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:dist-fresh:test',
    command: 'vitest run scripts/qa/check-dist-fresh.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:inflight:test',
    command:
      'vitest run scripts/qa/inflight.test.ts scripts/qa/gh-pages.test.ts scripts/qa/closed-prs-cache.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:edge-function-drift:test',
    command:
      'vitest run scripts/qa/edge-function-drift.test.ts scripts/qa/edge-function-imports.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:worktree-liveness:test',
    command: 'vitest run scripts/qa/worktree-liveness.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:primary-checkout:test',
    command:
      'vitest run scripts/qa/primary-checkout.test.ts scripts/bootstrap-worktree.test.ts scripts/qa/push-hold.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:no-ci-polling:test',
    command: 'vitest run scripts/qa/no-ci-polling.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:prelaunch-tripwire:test',
    command:
      'vitest run scripts/qa/prelaunch-tripwire.test.ts scripts/qa/deploy-migration-guard.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:ci-concurrency:test',
    command: 'vitest run scripts/qa/ci-concurrency.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:deploy-picker:test',
    command: 'vitest run scripts/qa/pick-deploy-commit.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:shared-rules:test',
    command: 'vitest run scripts/qa/sync-shared-rules.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:shared-rules',
    command:
      'node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/qa/sync-shared-rules.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:cloud:test',
    command: 'vitest run scripts/cloud --sequence.shuffle',
  },
  {
    pkgDir: '.',
    script: 'qa:prompt-parity:test',
    command: 'vitest run scripts/qa/check-prompt-parity.test.ts',
  },
  // MYK9-1432: the scripts test-wiring guard and the root suites it found unwired.
  {
    pkgDir: '.',
    script: 'qa:scripts-test-wiring:test',
    command: 'vitest run scripts/qa/scripts-test-wiring.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:code-quality-ratchet:test',
    command: 'vitest run scripts/qa/code-quality-ratchet.test.ts',
  },
  { pkgDir: '.', script: 'qa:db-drift:test', command: 'vitest run scripts/qa/db-drift/*.test.ts' },
  {
    pkgDir: '.',
    script: 'qa:isolated-e2e:test',
    command:
      'vitest run scripts/qa/isolated-e2e-*.test.ts scripts/qa/reserve-supabase-ports.test.ts scripts/qa/port-conflict-diagnostics.test.ts',
  },
  // MYK9-1449: the browser smoke jobs build their own disposable local Supabase.
  {
    pkgDir: '.',
    script: 'qa:isolated-e2e:prepare',
    command: 'tsx scripts/qa/isolated-e2e-lifecycle.ts prepare',
  },
  {
    pkgDir: '.',
    script: 'qa:isolated-e2e:stop',
    command: 'tsx scripts/qa/isolated-e2e-lifecycle.ts stop',
  },
  {
    pkgDir: '.',
    script: 'qa:rls-smoke:test',
    command: 'vitest run scripts/qa/rls-smoke/*.test.ts',
  },
  {
    pkgDir: '.',
    script: 'support:triage:test',
    command: 'vitest run scripts/support-triage/*.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:go-live:phase1:test',
    command: 'vitest run scripts/go-live/phase-1-platform-deploy.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:go-live:phase2:test',
    command: 'vitest run scripts/go-live/phase-2-data-access.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:go-live:phase3:test',
    command: 'vitest run scripts/go-live/phase-3-stripe-cutover.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:go-live:phase4:test',
    command: 'vitest run scripts/go-live/phase-4-evidence-pass.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:code-quality-ratchet',
    command: 'tsx scripts/qa/code-quality-ratchet.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:doc-staleness:strict',
    command: 'node scripts/check-doc-staleness.js --strict',
  },
  { pkgDir: '.', script: 'qa:plans:test', command: 'vitest run scripts/qa/plan-metadata.test.ts' },
  { pkgDir: '.', script: 'qa:plans', command: 'node --import tsx scripts/qa/plan-metadata.ts' },
  {
    pkgDir: '.',
    script: 'qa:types-drift:test',
    command: 'vitest run scripts/qa/supabase-types-drift.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:planted-bugs:test',
    command: 'vitest run scripts/qa/planted-bugs/lib.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:migrations:guard:test',
    command:
      'vitest run scripts/qa/migration-version-guard.test.ts scripts/qa/migration-version-guard.provenance.test.ts scripts/qa/db-push-sweep.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:migrations:guard',
    command: 'tsx scripts/qa/migration-version-guard.ts',
  },
  {
    pkgDir: '.',
    script: 'test:packages',
    command:
      'turbo test --filter=@myk9/core --filter=@myk9/replication --filter=@myk9/ringside --filter=@myk9/scoring --filter=@myk9/scoring-ui --filter=@myk9/supabase --filter=@myk9/ui',
  },
  {
    pkgDir: 'apps/myk9show',
    script: 'coverage:ratchet',
    command: 'tsx scripts/coverage-ratchet.ts',
  },
  { pkgDir: '.', script: 'build', command: 'turbo build' },
  {
    pkgDir: 'apps/myk9show',
    script: 'budget:check',
    command: 'node scripts/check-bundle-budget.js',
  },
  {
    pkgDir: 'apps/myk9show',
    script: 'test:a11y',
    command: 'cross-env PLAYWRIGHT_A11Y=true playwright test --config=playwright.ci.config.ts',
  },
  {
    pkgDir: 'apps/myk9show',
    script: 'test:e2e:ci',
    command: 'npx playwright test --config=playwright.ci.config.ts',
  },
];

/**
 * pnpm invocations in required jobs that are NOT package scripts (`install`,
 * `exec`, recursive builds). They cannot be neutered from `package.json`, but
 * they are pinned verbatim so the extraction stays EXHAUSTIVE: adding any new
 * `pnpm …` line to a required job fails until it is classified here or above.
 */
export const PINNED_RAW_INVOCATIONS: readonly string[] = [
  'pnpm install --frozen-lockfile',
  "pnpm -r --filter='./packages/*' build",
  "pnpm exec vitest run --reporter=default --reporter=blob --outputFile.blob=.vitest-reports/shard-${{ matrix.shard }}.json --exclude '**/integration/**' --exclude '**/debug-*.test.*' --sequence.shuffle --shard=${{ matrix.shard }}/6 --coverage",
  'pnpm exec vitest run --coverage --coverage.reporter=text-summary --coverage.reporter=json-summary --mergeReports=.vitest-reports',
  'pnpm exec tsx scripts/verify-e2e-auth-preflight.ts --check-roles secretary admin judge',
  'pnpm exec tsx scripts/verify-e2e-auth-preflight.ts --check-roles secretary exhibitor',
  'pnpm exec tsx scripts/verify-artifact-secrets.ts --skip-zip-files playwright-report-ci',
  'pnpm --filter @myk9/show exec playwright install --with-deps chromium',
];

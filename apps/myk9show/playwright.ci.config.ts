import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// Load .env.local first (gitignored), then .env — so E2E_* test creds reach the
// test process under this config too (the authed specs read them).
loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

const isA11ySmoke = process.env.PLAYWRIGHT_A11Y === 'true';
const isRegression =
  process.env.PLAYWRIGHT_REGRESSION === 'true' || process.env.PLAYWRIGHT_NIGHTLY === 'true';

// Regression: curated journey suite, run separately from the read-only health gate.
const REGRESSION_SPECS = [
  '**/uat/secretary/critical-path.spec.ts',
  '**/uat/secretary/disposable-entry.spec.ts',
  '**/uat/secretary/evidence.spec.ts',
  '**/uat/secretary/qa-regression-proof.spec.ts',
  // payment/* specs are excluded: both are aspirational mock-based suites
  // asserting features that don't exist (PayPal, chargebacks, payment plans)
  // and fail unconditionally. Real payment journeys are tracked in MYK9-42.
  '**/scoring/scoringWorkflow.spec.ts',
  '**/show/atShowJudgeScoring.spec.ts',
  '**/show/atShowOfflineScoring.spec.ts',
  '**/show/showManagement.spec.ts',
  // registration/entryCreationCore excluded: it drives app source modules via
  // browser `import('/src/store/entryStore.ts')` — a Zustand unit test wearing
  // an e2e costume. It cannot run against the dist/preview build and belongs in
  // Vitest, not Playwright. Rewrite/relocate tracked in MYK9-46.
  '**/registration/exhibitorSelfRegistration.spec.ts',
  '**/authentication-validation.spec.ts',
  // entities/entriesUI excluded: the secretary Entry Management page was
  // restructured (entry cards, Select-All header, bulk dialogs all moved), so
  // the file needs a holistic rewrite against the new layout. The show-id and
  // load-signal fixes are already in place as a head-start. Tracked in MYK9-46.
  '**/secretary/show-creation-wizard.spec.ts',
  '**/secretary/classCreation.spec.ts',
  '**/browse-shows-to-details.spec.ts',
  '**/my-entries-page-ui.spec.ts',
  '**/cross-role-workflows.spec.ts',
  '**/simple-connectivity.spec.ts',
];

// PR Smoke: 3 stable specs — connectivity, secretary regression proof, and the
// secretary critical-path UAT suite. Verified green under this config before
// promotion (2026-07-16). atShowOfflineScoring stays regression-only (depends on
// staging seed data); payment specs are excluded entirely (see REGRESSION_SPECS).
const PR_SMOKE_SPECS = [
  '**/simple-connectivity.spec.ts',
  '**/uat/secretary/qa-regression-proof.spec.ts',
  '**/uat/secretary/critical-path.spec.ts',
];

/**
 * CI E2E Test Configuration for myK9Show
 *
 * Runs E2E tests against a built preview of the app.
 * Chromium only to keep CI fast.
 *
 * Mode precedence: a11y > regression > pr-smoke.
 *
 * Run with: npx playwright test --config=playwright.ci.config.ts
 * Regression: PLAYWRIGHT_REGRESSION=true npx playwright test --config=playwright.ci.config.ts
 */
export default defineConfig({
  testDir: './src/test/e2e',
  testMatch: isA11ySmoke
    ? ['**/a11y-smoke.spec.ts']
    : isRegression
      ? REGRESSION_SPECS
      : PR_SMOKE_SPECS,
  grep: isA11ySmoke ? /has no serious\/critical violations/ : undefined,
  fullyParallel: false,
  forbidOnly: true,
  retries: 2,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report-ci', open: 'never' }],
    ['github'],
    ['list'],
  ],
  timeout: 60000,
  expect: {
    timeout: 15000,
  },
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});

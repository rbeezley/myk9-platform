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
  '**/show/atShowJudgeScoring.spec.ts',
  '**/show/atShowOfflineScoring.spec.ts',
  // Offline cold boot (MYK9-200 AC 1 / MYK9-203 AC 2). Secretary-authed, so it
  // is credential-eligible for PR smoke, but it depends on the Heartland seed
  // fixture exactly as atShowOfflineScoring does — same reason, same home.
  '**/offline-cold-boot.spec.ts',
  // scoring/scoringWorkflow and show/showManagement are obsolete candidate
  // suites; current coverage lives in focused scoring and management specs
  // tracked in docs/qa/e2e-suite-map.md.
  // exhibitorSelfRegistration depends on a separately seeded show whose entry
  // window is open; the default Heartland fixture is currently closed. Keep it
  // in the maintained inventory, but not in Nightly until that fixture exists.
  '**/authentication-validation.spec.ts',
  '**/slice2-dog-workspace-evidence.spec.ts',
  // The former entities/entriesUI suite targets the deleted table/card
  // implementation. Current registration-cockpit and mutation coverage lives
  // in the focused UAT specs below.
  '**/uat/secretary/entry-management-cockpit.spec.ts',
  '**/secretary/show-creation-wizard.spec.ts',
  '**/secretary/classCreation.spec.ts',
  '**/browse-shows-to-details.spec.ts',
  '**/my-entries-page-ui.spec.ts',
  // Exhibitor-authed. That used to bar a spec from PR_SMOKE_SPECS outright,
  // because the smoke job only received E2E_SECRETARY_*; it now also receives
  // E2E_DEMO_EXHIBITOR_*, so exhibitor specs are eligible. This one stays
  // Nightly-only on cost grounds rather than credentials.
  '**/myEntriesZoomReflow.spec.ts',
  '**/cross-role-workflows.spec.ts',
  '**/simple-connectivity.spec.ts',
  // Admin-authed: Nightly supplies every E2E_* credential, PR smoke only gets
  // E2E_SECRETARY_*, so this cannot live in PR_SMOKE_SPECS.
  '**/admin/userRosterDrilldown.spec.ts',
];

// PR Smoke: stable specs — connectivity, secretary regression proof, the
// secretary critical-path UAT suite, and the exhibitor My Shows page. Verified
// green under this config before promotion (2026-07-16; My Shows 2026-08-20).
// atShowOfflineScoring stays regression-only (depends on staging seed data);
// payment specs are excluded entirely (see REGRESSION_SPECS).
//
// my-entries-page-ui.spec.ts is here because a PR that rewrote that page's
// entire status vocabulary (#1699) merged green while this spec was failing —
// it was Nightly-only, so nothing caught a stale assertion until the page was
// opened in a browser by hand. It is exhibitor-authed; the smoke job now
// receives E2E_DEMO_EXHIBITOR_* alongside E2E_SECRETARY_* to support it.
const PR_SMOKE_SPECS = [
  '**/simple-connectivity.spec.ts',
  '**/uat/secretary/qa-regression-proof.spec.ts',
  '**/uat/secretary/critical-path.spec.ts',
  '**/my-entries-page-ui.spec.ts',
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
  // F10: scrub e2e passwords out of failure artifacts before CI uploads them.
  globalTeardown: './src/test/e2e/helpers/scrubArtifactSecrets.ts',
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

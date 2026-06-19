import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// Load .env.local first (gitignored), then .env — so E2E_* test creds reach the
// test process under this config too (the authed specs read them).
loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

const isA11ySmoke = process.env.PLAYWRIGHT_A11Y === 'true';

/**
 * CI E2E Test Configuration for myK9Show
 *
 * Runs E2E tests against a built preview of the app.
 * Chromium only to keep CI fast.
 *
 * Run with: npx playwright test --config=playwright.ci.config.ts
 */
export default defineConfig({
  testDir: './src/test/e2e',
  // PR Smoke: 2 stable specs — connectivity + secretary regression proof.
  // The Nightly suite (20 specs) runs on a separate schedule, not in CI.
  testMatch: isA11ySmoke
    ? ['**/a11y-smoke.spec.ts']
    : ['**/simple-connectivity.spec.ts', '**/uat/secretary/qa-regression-proof.spec.ts'],
  grep: isA11ySmoke
    ? /has no serious\/critical violations/
    : /load home page without authentication|Secretary QA regression proof/,
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

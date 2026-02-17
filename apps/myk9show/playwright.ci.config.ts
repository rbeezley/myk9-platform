import { defineConfig, devices } from '@playwright/test';

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

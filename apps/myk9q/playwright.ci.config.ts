import { defineConfig, devices } from '@playwright/test';

/**
 * CI E2E Test Configuration for myK9Q
 *
 * Runs E2E tests against a built preview of the app.
 * Used in GitHub Actions CI pipeline.
 *
 * This config uses `vite preview` to serve the pre-built dist folder,
 * which is faster and more representative of production than dev mode.
 *
 * Run with: npx playwright test --config=playwright.ci.config.ts
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Run tests sequentially for predictable state
  forbidOnly: true, // Fail if test.only is left in code
  retries: 2, // Retry failed tests twice in CI
  workers: 1, // Single worker for consistent test ordering
  reporter: [
    ['html', { outputFolder: 'playwright-report-ci' }],
    ['github'], // GitHub Actions annotations
    ['list']
  ],
  timeout: 60000, // 60 second timeout per test
  expect: {
    timeout: 15000, // 15 second timeout for assertions (CI can be slower)
  },
  use: {
    baseURL: 'http://localhost:4173', // Vite preview default port
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile testing in CI for responsive verification
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI, // Reuse locally, fresh in CI
    timeout: 120000,
  },
});

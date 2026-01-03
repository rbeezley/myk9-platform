import { defineConfig, devices } from '@playwright/test';

/**
 * E2E Test Configuration for myK9Q
 *
 * Separate from responsive tests - focuses on functional testing
 * of authentication, navigation, and core features.
 *
 * Run with: npx playwright test --config=playwright.e2e.config.ts
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Run tests sequentially for predictable state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Single worker for consistent test ordering
  reporter: [
    ['html', { outputFolder: 'playwright-report-e2e' }],
    ['list']
  ],
  timeout: 60000, // 60 second timeout per test
  expect: {
    timeout: 10000, // 10 second timeout for assertions
  },
  use: {
    baseURL: 'http://localhost:5173',
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
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 120000,
  },
});

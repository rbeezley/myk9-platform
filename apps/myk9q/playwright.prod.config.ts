import { defineConfig, devices } from '@playwright/test';

/**
 * Production E2E Test Configuration for myK9Q
 *
 * Tests against the live Vercel deployment at https://app.myk9q.com
 * Uses production passcode for authentication.
 *
 * Run with: npx playwright test --config=playwright.prod.config.ts
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Run tests sequentially for predictable state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Single worker for consistent test ordering
  reporter: [
    ['html', { outputFolder: 'playwright-report-prod' }],
    ['list']
  ],
  timeout: 60000, // 60 second timeout per test
  expect: {
    timeout: 15000, // 15 second timeout for assertions
  },
  use: {
    baseURL: 'https://app.myk9q.com',
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
  // No webServer needed - testing against production
});

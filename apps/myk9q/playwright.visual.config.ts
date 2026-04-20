import { defineConfig, devices } from '@playwright/test';

/**
 * Visual Regression Configuration for myK9Q — v2 Phase 1
 *
 * Captures screenshots of canonical screens in light + dark to serve
 * as baselines for future Phase 2/3 drift detection. Kept separate
 * from the functional e2e config so a visual diff never blocks a
 * functional smoke run and vice versa.
 *
 * Run: pnpm exec playwright test --config=playwright.visual.config.ts
 * Regenerate baselines: add --update-snapshots
 */
export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report-visual' }], ['list']],
  timeout: 60000,
  expect: {
    timeout: 10000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
  },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
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
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 120000,
  },
});

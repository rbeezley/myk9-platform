import { defineConfig, devices } from '@playwright/test';

// Manual proof only: natural token expiry deliberately takes over an hour.
export default defineConfig({
  testDir: './src/test/e2e/verification',
  testMatch: '**/showDayReliability.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 10 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-ci', open: 'never' }],
    [
      './src/test/e2e/reporters/scrubSecretsReporter.ts',
      { outputDirs: ['playwright-report-ci', 'test-results'] },
    ],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
  },
  webServer: {
    command: 'pnpm preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

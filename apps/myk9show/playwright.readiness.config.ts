import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { loadAppServerCommand, resolveLoadAppServerMode } from './src/test/load/loadAppServer';

loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5188';
const parsedBaseURL = new URL(baseURL);
const port = Number(process.env.PLAYWRIGHT_PORT || parsedBaseURL.port || '5188');
const startApp = process.env.LOAD_TEST_START_APP === 'true';

// MYK9-126 acceptance criterion 6. Serves the same production bundle the G9
// rehearsal serves, so a readiness result here is comparable to the rehearsal's
// -- but with one session per route instead of a hundred, which is what
// separates an app defect from generator contention.
export default defineConfig({
  testDir: './src/test/load',
  testMatch: 'pageReadiness.probe.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 4 * 60 * 1_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  outputDir: 'test-results/readiness',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: startApp
    ? {
        command: loadAppServerCommand(resolveLoadAppServerMode(process.env), port),
        port,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
});

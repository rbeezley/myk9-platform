import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { loadAppServerCommand, resolveLoadAppServerMode } from './src/test/load/loadAppServer';

loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const parsedBaseURL = new URL(baseURL);
// `||` not `??`: URL.port is '' for a default-port base URL, which would coerce
// to port 0 and bind a random port the harness never connects to.
const port = Number(process.env.PLAYWRIGHT_PORT || parsedBaseURL.port || '5173');
const startApp = process.env.LOAD_TEST_START_APP === 'true';
const appServerMode = resolveLoadAppServerMode(process.env);

export default defineConfig({
  testDir: './src/test/load',
  testMatch: 'playwright-load-tests.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  // The manual workflow can hold at the barrier for 35 minutes before
  // running the full 10-minute scenario.
  timeout: 50 * 60 * 1_000,
  expect: { timeout: 20_000 },
  reporter: [
    ['list'],
    // F10: must run AFTER the html reporter writes its report, so this is a
    // reporter listed LAST -- a globalTeardown runs before reporter.onEnd.
    ['./src/test/e2e/reporters/scrubSecretsReporter.ts'],
  ],
  outputDir: 'test-results/load',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: startApp
    ? {
        // LOAD_TEST_APP_SERVER picks the server; CI sets 'preview' so the
        // rehearsal measures the built bundle rather than dev-mode transform
        // cost, and local runs keep the dev default.
        command: loadAppServerCommand(appServerMode, port),
        port,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
});

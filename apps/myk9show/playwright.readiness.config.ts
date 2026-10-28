import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { assertPlaywrightRunAllowed } from './src/test/productionFixtureGuard';
import { loadAppServerCommand, resolveLoadAppServerMode } from './src/test/load/loadAppServer';

// MYK9-1454: the shell's own environment, before .env files; the production opt-in is read from it.
const shellEnv = { ...process.env };
loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5188';
const parsedBaseURL = new URL(baseURL);
const port = Number(process.env.PLAYWRIGHT_PORT || parsedBaseURL.port || '5188');
const startApp = process.env.LOAD_TEST_START_APP === 'true';
// MYK9-1454: refuse to sign fixture accounts into production unless the run opts in. Without
// LOAD_TEST_START_APP the run drives whatever PLAYWRIGHT_BASE_URL serves.
assertPlaywrightRunAllowed(
  'playwright.readiness.config.ts',
  shellEnv,
  startApp
    ? {
        kind: 'own',
        mode: resolveLoadAppServerMode(process.env),
        browserUrl: baseURL,
        serverPort: port,
      }
    : { kind: 'external' }
);

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
  reporter: [
    ['list'],
    // F10: must run AFTER the html reporter writes its report, so this is a
    // reporter listed LAST -- a globalTeardown runs before reporter.onEnd.
    ['./src/test/e2e/reporters/scrubSecretsReporter.ts'],
  ],
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

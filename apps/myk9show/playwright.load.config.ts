import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const parsedBaseURL = new URL(baseURL);
const port = Number(process.env.PLAYWRIGHT_PORT ?? parsedBaseURL.port ?? '5173');
const startApp = process.env.LOAD_TEST_START_APP === 'true';

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
  reporter: [['list']],
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
        command: `pnpm run dev --host 127.0.0.1 --port ${port} --strictPort`,
        port,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
});

import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { resolveAuditTarget } from './scripts/playwright-audit-target';

loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

const target = resolveAuditTarget(process.env);

/**
 * Fail-closed browser-audit configuration.
 *
 * Start the explicitly owned app server with the same non-secret identity:
 *   VITE_AUDIT_SERVER_ID=<id> pnpm dev:show
 * Then run this config with PLAYWRIGHT_AUDIT_SERVER_ID=<id>, an explicit
 * PLAYWRIGHT_AUDIT_BASE_URL, and PLAYWRIGHT_AUDIT_DATA_TARGET set to
 * shared-staging-intercepted. Stateful specs must install the shared-staging
 * write guard before navigation.
 */
export default defineConfig({
  // F10: scrub e2e passwords out of failure artifacts before CI uploads them.
  globalTeardown: './src/test/e2e/helpers/scrubArtifactSecrets.ts',
  testDir: './src/test/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/audit-report' }]],
  outputDir: 'test-results/audit',
  globalSetup: './src/test/e2e/helpers/auditGlobalSetup.ts',
  use: {
    baseURL: target.baseURL,
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'tablet-landscape',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
  ],
});

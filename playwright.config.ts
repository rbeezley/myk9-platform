import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

/**
 * Root-level Playwright config for the monorepo.
 *
 * The Playwright MCP tool (`mcp__playwright-test__*`) walks up from the cwd
 * looking for a `playwright.config.ts`. With two app-level configs
 * (`apps/myk9q` and `apps/myk9show`) and no root config, MCP would pick the
 * first alphabetical match (`apps/myk9q`), whose `testDir` does not include
 * the myk9show platform e2e suite.
 *
 * This config mirrors `apps/myk9show/playwright.config.ts` but uses absolute
 * paths anchored at the monorepo root so paths resolve correctly when MCP
 * tooling runs from the root. To run myk9q tests, invoke them from
 * `apps/myk9q` directly (`pnpm --filter myk9q test:e2e`).
 */

const myk9showRoot = path.resolve(__dirname, 'apps/myk9show');

loadEnv({ path: path.join(myk9showRoot, '.env.local'), override: false });
loadEnv({ path: path.join(myk9showRoot, '.env'), override: false });

export default defineConfig({
  testDir: path.join(myk9showRoot, 'src/test/e2e'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 4,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: path.join(myk9showRoot, 'test-results'),
  snapshotDir: path.join(myk9showRoot, 'src/test/e2e/__snapshots__'),
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{projectName}/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 100,
      threshold: 0.2,
    },
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

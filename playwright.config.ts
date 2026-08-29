import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

/**
 * Root-level Playwright config for the monorepo.
 *
 * The Playwright MCP tool (`mcp__playwright-test__*`) walks up from the cwd
 * looking for a `playwright.config.ts`, so the root needs one that points at the
 * myk9show e2e suite rather than leaving the choice to whatever config is found
 * first. (`apps/myk9q`, the other config this once had to outrank, has since been
 * deleted -- see CLAUDE.md "Deleted monorepo app".)
 *
 * This config mirrors `apps/myk9show/playwright.config.ts` but uses absolute
 * paths anchored at the monorepo root so paths resolve correctly when tooling
 * runs from the root.
 *
 * F11: the root workspace must DECLARE `@playwright/test`, which this file
 * imports. It previously resolved only by pnpm hoisting accident in the primary
 * checkout; a fresh worktree failed with `Cannot find module '@playwright/test'`
 * after bootstrap, because worktrees do not share node_modules.
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

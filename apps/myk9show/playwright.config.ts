import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// Load .env.local first (gitignored, takes precedence), then fall back to .env.
loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const parsedBaseURL = new URL(baseURL);
const webServerPort = Number(process.env.PLAYWRIGHT_PORT || parsedBaseURL.port || '5173');
const webServerHmrPort = Number(process.env.PLAYWRIGHT_HMR_PORT || webServerPort + 20000);

export default defineConfig({
  testDir: './src/test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1, // Add retry for flaky tests
  workers: process.env.CI ? 1 : 4, // Limit workers to prevent resource contention
  reporter: [['list'], ['html', { open: 'never' }]],
  // Output directory for test artifacts
  outputDir: 'test-results',
  // F10: a failed test's error-context.md carries the page's accessibility snapshot,
  // which includes the filled password field's value -- and CI uploads these on
  // failure. Scrub the literal secrets after the run, before that upload.
  globalTeardown: './src/test/e2e/helpers/scrubArtifactSecrets.ts',
  // Snapshot settings for visual regression testing
  snapshotDir: './src/test/e2e/__snapshots__',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{projectName}/{arg}{ext}',
  expect: {
    // Visual comparison settings
    toHaveScreenshot: {
      maxDiffPixels: 100, // Allow small differences
      threshold: 0.2, // 20% pixel difference threshold
    },
  },
  use: {
    // Use 127.0.0.1 explicitly so we don't accidentally hit a different
    // worktree's vite that's bound to IPv6 ::1:5173 (macOS resolves
    // "localhost" to IPv6 first).
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Video recording for debugging failed tests
    video: 'on-first-retry',
    // Viewport settings
    viewport: { width: 1280, height: 720 },
    // Action timeout
    actionTimeout: 10000,
    // Navigation timeout
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    // iOS Safari — the configuration most myK9Show users are actually on at a
    // show, and the one where IndexedDB, service workers and storage eviction
    // diverge most from Chromium. Offline-first depends on all three, so a
    // regression here is invisible to every chromium-only run.
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
      },
    },
  ],
  webServer: {
    command: `VITE_HMR_PORT=${webServerHmrPort} pnpm run dev --host 127.0.0.1 --port ${webServerPort} --strictPort`,
    port: webServerPort,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});

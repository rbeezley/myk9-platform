import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// Load .env.local first (gitignored, takes precedence), then fall back to .env.
loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

export default defineConfig({
  testDir: './src/test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1, // Add retry for flaky tests
  workers: process.env.CI ? 1 : 4, // Limit workers to prevent resource contention
  reporter: [['list'], ['html', { open: 'never' }]],
  // Output directory for test artifacts
  outputDir: 'test-results',
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
    baseURL: 'http://127.0.0.1:5173',
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
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1, // Add retry for flaky tests
  workers: process.env.CI ? 1 : 4, // Limit workers to prevent resource contention
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  // Output directory for test artifacts
  outputDir: 'test-results',
  // Snapshot settings for visual regression testing
  snapshotDir: './src/test/e2e/__snapshots__',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{projectName}/{arg}{ext}',
  expect: {
    // Visual comparison settings
    toHaveScreenshot: {
      maxDiffPixels: 100, // Allow small differences
      threshold: 0.2,     // 20% pixel difference threshold
    },
  },
  use: {
    baseURL: 'http://localhost:5173',
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

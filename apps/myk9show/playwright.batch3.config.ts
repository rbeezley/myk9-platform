import { defineConfig } from '@playwright/test';
import base from './playwright.show-day.config';
import { assertPlaywrightRunAllowed } from './src/test/productionFixtureGuard';

// MYK9-1454: refuse to sign fixture accounts into production unless the run opts in.
assertPlaywrightRunAllowed('playwright.batch3.config.ts', process.env);

export default defineConfig({
  ...base,
  testMatch: ['**/batch3Scoring.spec.ts', '**/batch4Paperwork.spec.ts'],
  projects: [{ name: 'isolated-batch3-proof' }],
  timeout: 6 * 60_000,
});

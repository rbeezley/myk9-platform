import { defineConfig } from '@playwright/test';
import base from './playwright.show-day.config';

export default defineConfig({
  ...base,
  testMatch: '**/batch3Scoring.spec.ts',
  projects: [{ name: 'isolated-batch3-proof' }],
  timeout: 6 * 60_000,
});

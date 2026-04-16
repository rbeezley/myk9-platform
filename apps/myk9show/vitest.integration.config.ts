import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Integration test config — no global Supabase mock, hits the real DB.
// Run with: pnpm test:integration
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node', // No jsdom needed for DB-only tests
    setupFiles: [], // Intentionally empty — skip the global Supabase mock
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 30000, // DB round-trips take longer
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      pako: path.resolve(__dirname, 'src/test/mocks/pako.ts'),
    },
  },
});

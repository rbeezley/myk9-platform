import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    env: {
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'eyJ0ZXN0IjoidGVzdCJ9.test-anon-key',
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
      thresholds: {
        statements: 50,
        branches: 44,
        functions: 53,
        lines: 51,
      },
      exclude: [
        'node_modules/',
        'src/test/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types/**',
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Mirror the vite.config.ts alias for the same reason: tests must
      // resolve @myk9/ringside to source so a missing or stale
      // packages/ringside/dist doesn't break `cd apps/myk9q && npx vitest`.
      // See the longer comment in vite.config.ts.
      '@myk9/ringside': path.resolve(__dirname, '../../packages/ringside/src/index.ts'),
    },
  },
});

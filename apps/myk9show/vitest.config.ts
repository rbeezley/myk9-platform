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
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/*.spec.ts', // Playwright specs
      '**/*.integration.test.ts', // Integration tests run via vitest.integration.config.ts
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
      thresholds: {
        statements: 33,
        branches: 24,
        functions: 29,
        lines: 35,
      },
      exclude: ['node_modules/', 'src/test/', '**/*.d.ts', '**/*.config.*', '**/types/**'],
    },
    // Increase timeout for slower tests
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Stub packages that are not installed but imported by source files under test.
      // Tests that need real behavior mock these via vi.mock() in the test file.
      pako: path.resolve(__dirname, 'src/test/mocks/pako.ts'),
      'virtual:pwa-register': path.resolve(
        __dirname,
        'src/test/mocks/virtual-pwa-register.ts'
      ),
    },
  },
});

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
    // Array form + regex-anchored `@myk9/ringside` so the alias doesn't
    // prefix-match `@myk9/ringside/styles`. See vite.config.ts for the
    // full rationale.
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      {
        find: /^@myk9\/ringside$/,
        replacement: path.resolve(__dirname, '../../packages/ringside/src/index.ts'),
      },
    ],
  },
});

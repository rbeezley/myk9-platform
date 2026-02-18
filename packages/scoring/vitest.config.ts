import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['@myk9/test-utils/src/setup/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
      thresholds: {
        statements: 96,
        branches: 90,
        functions: 98,
        lines: 96,
      },
      exclude: ['node_modules/', '**/*.d.ts', '**/*.config.*', '**/types/**'],
    },
  },
});

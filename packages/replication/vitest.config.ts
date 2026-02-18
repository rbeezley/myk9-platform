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
        statements: 74,
        branches: 72,
        functions: 69,
        lines: 74,
      },
      exclude: ['node_modules/', '**/*.d.ts', '**/*.config.*', '**/types/**'],
    },
  },
});

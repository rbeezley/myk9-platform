import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['@myk9/test-utils/src/setup/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
      thresholds: {
        statements: 84,
        branches: 81,
        functions: 86,
        lines: 84,
      },
      exclude: ['node_modules/', '**/*.d.ts', '**/*.config.*', '**/types/**', '**/test-setup.ts'],
    },
  },
});

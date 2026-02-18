import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['@myk9/test-utils/src/setup/vitest.setup.ts', './src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
      thresholds: {
        statements: 79,
        branches: 67,
        functions: 60,
        lines: 81,
      },
      exclude: ['node_modules/', '**/*.d.ts', '**/*.config.*', '**/types/**', '**/test-setup.ts'],
    },
  },
});

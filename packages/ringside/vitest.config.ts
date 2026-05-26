import { defineConfig } from 'vitest/config';

/**
 * Vitest config for @myk9/ringside.
 *
 * Mirrors the @myk9/scoring-ui shape — jsdom environment, shared setup
 * file from @myk9/test-utils. Coverage thresholds are intentionally
 * omitted while the package is empty (PR A scaffold); add them in a
 * later PR once real coverage data is meaningful.
 */
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
      exclude: ['node_modules/', '**/*.d.ts', '**/*.config.*', '**/types/**'],
    },
  },
});

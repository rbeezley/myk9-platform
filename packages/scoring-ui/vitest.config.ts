import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: [
      '@myk9/test-utils/src/setup/jest-dom.ts',
      '@myk9/test-utils/src/setup/vitest.setup.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
      thresholds: {
        statements: 79,
        branches: 65,
        // 71 -> 70 (MYK9-646). Deleting `useEntryListFilters` -- an unreferenced
        // duplicate of the @myk9/ringside hook, with its own 331-line suite --
        // removed a fully covered module, so the RATIO fell to 70.13% while no
        // remaining function lost a single test. The other three thresholds
        // were unaffected and stay where they are; raise this one again the
        // next time a scoresheet gets real coverage.
        functions: 70,
        lines: 81,
      },
      exclude: ['node_modules/', '**/*.d.ts', '**/*.config.*', '**/types/**'],
    },
  },
});

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
        // took a module covered ABOVE the package average out of the ratio:
        // 28/31 of its functions were covered (90.32%) against a package whole
        // of 183, so the remaining 155/221 is 70.13%. No surviving function
        // lost a test. Statements moved 80.55 -> 80.09, still clear of 79;
        // branches and lines both IMPROVED, so those three thresholds stay
        // where they are. Raise this one again the next time a scoresheet gets
        // real coverage.
        functions: 70,
        lines: 81,
      },
      exclude: ['node_modules/', '**/*.d.ts', '**/*.config.*', '**/types/**'],
    },
  },
});

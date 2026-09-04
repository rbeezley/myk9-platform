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
      // Set just under the measured numbers (99.41 / 93.10 / 100 / 100), so a
      // regression fails rather than being absorbed by slack.
      //
      // These were 92 / 84 / 94 / 92, calibrated for a package roughly three
      // times this size. MYK9-328 deleted 2,228 lines of well-covered code from
      // it, which shrank the DENOMINATOR: the ratio fell to 91.64 / 85.41 /
      // 93.22 / 92.62 and `main` went red for 18 hours. Nothing had become less
      // correct — the surviving uncovered lines simply stopped being diluted.
      //
      // The lesson is in the gap between those two sets of numbers. Slack in a
      // coverage threshold is not safety margin; it is the amount of erosion
      // that can happen before anyone is told. Keep these tight to the real
      // figures and move them deliberately.
      //
      // NOTE: this gate still only runs on `push` (see the `Test packages` step
      // in .github/workflows/ci.yml) — so a PR that lowers coverage is green and
      // `main` goes red on merge. That is how the regression above reached
      // `main` in the first place, and raising these numbers does not fix it.
      thresholds: {
        statements: 99,
        branches: 92,
        functions: 100,
        lines: 99,
      },
      exclude: [
        'node_modules/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types/**',
        // Browser-API adapters — not unit-testable in a Node environment
        '**/utils/deviceDetection.ts',
      ],
    },
  },
});

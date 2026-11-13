import { MUTATION_TARGET_DEFS as targets } from './scripts/qa/mutation/targets.mjs';

const targetName = process.env.MYK9_MUTATION_TARGET;

if (!targetName || !(targetName in targets)) {
  throw new Error(`Set MYK9_MUTATION_TARGET to one of: ${Object.keys(targets).join(', ')}`);
}

const target = targets[targetName];

export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: target.mutate,
  // No `testFiles` here on purpose (MYK9-1829). Stryker turns a non-empty
  // `testFiles` into a test filter on every mutant run, and any mutant with a
  // filter is activated "at runtime" (vitest-runner stryker-setup.js L14-21:
  // `beforeAll`, after the test file has imported the mutated module). A
  // module-level (static) mutant is evaluated at import, so it was never active:
  // parseDuration.ts L93 `const fail = ...` => `() => undefined` reported
  // Survived with every test green. Without `testFiles`, static mutants run all
  // tests with 'static' activation (set at setup time) and are Killed
  // (experiment: that mutant is Killed by 23 tests). Which tests run is decided
  // by `test.include` in vitest.mutation.config.ts; both come from
  // scripts/qa/mutation/targets.mjs. assertTestsSawMutants.ts pins the L93 answer.
  vitest: {
    configFile: 'vitest.mutation.config.ts',
    related: false,
  },
  // Stryker copies the tree into a sandbox with copyFile, which rejects a
  // symlink (ENOTSUP). Every skill tree holds symlinks since #2062/#2064, so
  // all three are ignored, plus the per-worktree log directory and docs.
  ignorePatterns: [
    '.agents/**',
    '.claude/**',
    '.codex/**',
    '.logs/**',
    '.worktrees/**',
    'docs/**',
    'reports/**',
    'skills/**',
  ],
  reporters: ['clear-text', 'progress', 'json', 'html'],
  jsonReporter: {
    fileName: `reports/mutation/${targetName}/mutation.json`,
  },
  htmlReporter: {
    fileName: `reports/mutation/${targetName}/index.html`,
  },
  tempDirName: `.stryker-tmp/${targetName}`,
  // `break` makes the weekly run (.github/workflows/mutation-tests.yml) fail
  // when a target's score falls below the `low` floor; with `null` a 0% score
  // exited 0 and the notifier could never fire (Codex review of #2120).
  // cart measured 71.79% on 2026-09-07.
  thresholds: {
    high: 80,
    low: 60,
    break: 60,
  },
  concurrency: 2,
};

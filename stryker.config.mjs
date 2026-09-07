const targetName = process.env.MYK9_MUTATION_TARGET;

const targets = {
  cart: {
    mutate: ['apps/myk9show/src/store/cartStore.helpers.ts'],
    testFiles: ['apps/myk9show/src/store/cartStore.helpers.test.ts'],
  },
  'score-validator': {
    mutate: ['apps/myk9show/src/services/scoring/ScoreValidatorService.ts'],
    testFiles: ['apps/myk9show/src/services/scoring/ScoreValidatorService.test.ts'],
  },
  placement: {
    mutate: ['apps/myk9show/src/services/scoring/PlacementCalculatorService.helpers.ts'],
    testFiles: ['apps/myk9show/src/services/scoring/PlacementCalculatorService.helpers.test.ts'],
  },
  'replication-conflict': {
    mutate: [
      'packages/replication/src/conflict/ConflictResolver.ts',
      'packages/replication/src/conflict/detectDirtyRowConflict.ts',
      'packages/replication/src/core/ReplicatedTableConflict.ts',
    ],
    testFiles: [
      'packages/replication/src/conflict/ConflictResolver.test.ts',
      'packages/replication/src/conflict/detectDirtyRowConflict.test.ts',
      'packages/replication/src/core/ReplicatedTableConflict.test.ts',
    ],
  },
};

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
  testFiles: target.testFiles,
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
  thresholds: {
    high: 80,
    low: 60,
    break: null,
  },
  concurrency: 2,
};

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import appConfig from './apps/myk9show/vitest.config';
import replicationConfig from './packages/replication/vitest.config';
import { vitestNamePatternShim } from './scripts/qa/mutation/vitestNamePatternShim';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const targetName = process.env.MYK9_MUTATION_TARGET;

// Stryker names every test by its path relative to the process cwd (the sandbox
// root) and hands those paths back to Vitest as file filters, which Vitest
// matches relative to its own `root`. A `root` of apps/myk9show made every
// filter miss ("No test files found", swallowed by the runner), so each mutant
// ran zero tests and "survived" (MYK9-1657). `root` is therefore the cwd, and
// the per-package paths below are written relative to it.
const appDir = 'apps/myk9show';
const replicationDir = 'packages/replication';

const targets = {
  cart: {
    base: appConfig,
    setupFile: path.join(rootDir, appDir, 'src/test/setup.ts'),
    include: [`${appDir}/src/store/cartStore.helpers.test.ts`],
  },
  'score-validator': {
    base: appConfig,
    setupFile: path.join(rootDir, appDir, 'src/test/setup.ts'),
    include: [`${appDir}/src/services/scoring/ScoreValidatorService.test.ts`],
  },
  placement: {
    base: appConfig,
    setupFile: path.join(rootDir, appDir, 'src/test/setup.ts'),
    include: [`${appDir}/src/services/scoring/PlacementCalculatorService.helpers.test.ts`],
  },
  'replication-conflict': {
    base: replicationConfig,
    setupFile: path.join(
      rootDir,
      replicationDir,
      'node_modules/@myk9/test-utils/src/setup/vitest.setup.ts'
    ),
    include: [
      `${replicationDir}/src/conflict/ConflictResolver.test.ts`,
      `${replicationDir}/src/conflict/detectDirtyRowConflict.test.ts`,
      `${replicationDir}/src/core/ReplicatedTableConflict.test.ts`,
    ],
  },
} as const;

if (!targetName || !(targetName in targets)) {
  throw new Error(`Set MYK9_MUTATION_TARGET to one of: ${Object.keys(targets).join(', ')}`);
}

if (path.resolve(process.cwd()) !== path.resolve(rootDir)) {
  throw new Error(
    `vitest.mutation.config.ts must be loaded with cwd === its own directory (cwd ${process.cwd()}, config ${rootDir}); ` +
      'otherwise Stryker test ids and Vitest file filters disagree and no mutant runs a test.'
  );
}

const target = targets[targetName as keyof typeof targets];

const merged = mergeConfig(
  target.base,
  defineConfig({ root: rootDir, plugins: [vitestNamePatternShim()] })
);

// Stryker 9.6/10.1 builds a space-joined test name filter that Vitest 4+ never
// matches inside a describe block; the shim is the second half of MYK9-1657.
// mergeConfig concatenates arrays; include and setupFiles must be replaced.
export default {
  ...merged,
  test: {
    ...merged.test,
    include: [...target.include],
    setupFiles: [target.setupFile],
  },
};

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import appConfig from './apps/myk9show/vitest.config';
import replicationConfig from './packages/replication/vitest.config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const targetName = process.env.MYK9_MUTATION_TARGET;

const targets = {
  cart: {
    base: appConfig,
    root: path.join(rootDir, 'apps/myk9show'),
    include: ['src/store/cartStore.helpers.test.ts'],
  },
  'score-validator': {
    base: appConfig,
    root: path.join(rootDir, 'apps/myk9show'),
    include: ['src/services/scoring/ScoreValidatorService.test.ts'],
  },
  placement: {
    base: appConfig,
    root: path.join(rootDir, 'apps/myk9show'),
    include: ['src/services/scoring/PlacementCalculatorService.helpers.test.ts'],
  },
  'replication-conflict': {
    base: replicationConfig,
    root: path.join(rootDir, 'packages/replication'),
    include: [
      'src/conflict/ConflictResolver.test.ts',
      'src/conflict/detectDirtyRowConflict.test.ts',
      'src/core/ReplicatedTableConflict.test.ts',
    ],
  },
} as const;

if (!targetName || !(targetName in targets)) {
  throw new Error(`Set MYK9_MUTATION_TARGET to one of: ${Object.keys(targets).join(', ')}`);
}

const target = targets[targetName as keyof typeof targets];

export default mergeConfig(
  target.base,
  defineConfig({
    root: target.root,
    test: {
      include: [...target.include],
    },
  })
);

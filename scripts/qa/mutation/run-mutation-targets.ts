import { spawnSync } from 'node:child_process';

import { assertReportFileSawMutants } from './assertTestsSawMutants';

const targets = ['cart', 'score-validator', 'placement', 'replication-conflict'] as const;

for (const target of targets) {
  console.log(`\n=== Mutation target: ${target} ===`);

  const result = spawnSync('pnpm', ['exec', 'stryker', 'run', 'stryker.config.mjs'], {
    env: { ...process.env, MYK9_MUTATION_TARGET: target },
    stdio: 'inherit',
  });

  // Before the exit-code check: a blind target should fail with its real cause,
  // not as a low score (MYK9-1657).
  assertReportFileSawMutants(target, `reports/mutation/${target}/mutation.json`);

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('\nAll mutation targets passed.');

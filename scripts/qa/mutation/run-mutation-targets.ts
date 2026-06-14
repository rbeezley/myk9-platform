import { spawnSync } from 'node:child_process';

const targets = ['cart', 'score-validator', 'placement', 'replication-conflict'] as const;

for (const target of targets) {
  console.log(`\n=== Mutation target: ${target} ===`);

  const result = spawnSync('pnpm', ['exec', 'stryker', 'run', 'stryker.config.mjs'], {
    env: { ...process.env, MYK9_MUTATION_TARGET: target },
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('\nAll mutation targets passed.');

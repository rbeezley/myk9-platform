import { spawnSync } from 'node:child_process';

const commands: ReadonlyArray<readonly [string, ...string[]]> = [
  ['pnpm', 'run', 'test:load:unit'],
  [
    'pnpm',
    'exec',
    'playwright',
    'test',
    '--config=playwright.load.config.ts',
    '--grep',
    'G9 Normal show-day load',
  ],
];

for (const [command, ...args] of commands) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}

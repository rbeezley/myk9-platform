#!/usr/bin/env node
// Cross-platform launcher for the full load-test suite.
//
// Uses spawnSync (not the fire-and-forget spawn) so the child's exit status is
// propagated to this process — otherwise a failing load run reports success and
// `test:load:full` looks green even when the suite errored (caught in PR #745
// review: run-load-tests.sh printed "Application is not running" yet the npm
// script exited 0). On Windows the .bat is launched through `cmd /c` because
// Node can no longer spawn .bat files directly without a shell.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === 'win32';
const script = join(here, isWindows ? 'run-load-tests.bat' : 'run-load-tests.sh');

const result = isWindows
  ? spawnSync('cmd', ['/c', script], { stdio: 'inherit' })
  : spawnSync('bash', [script], { stdio: 'inherit' });

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

// status is null when the child was killed by a signal — treat that as failure.
process.exit(result.status ?? 1);

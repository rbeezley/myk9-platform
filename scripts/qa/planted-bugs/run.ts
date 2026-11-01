/**
 * Planted-bug audit runner (MYK9-1653). Applies one hand-written mutant patch at a
 * time to THIS worktree, runs its checks, reverts it, and prints a results table.
 *
 *   pnpm qa:planted-bugs            (run from a clean worktree)
 *   pnpm qa:planted-bugs -- --only run-order   (substring match on mutant id)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  baselineRed,
  classify,
  renderTable,
  uniqueChecks,
  validateManifest,
  type CheckResult,
  type Mutant,
  type Row,
} from './lib';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(DIR, '../../..');

function sh(command: string, args: string[], opts: { inherit?: boolean } = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: opts.inherit ? 'ignore' : 'pipe',
  });
}

function porcelain(): string {
  return sh('git', ['status', '--porcelain']).stdout.trim();
}

function assertClean(when: string): void {
  const dirty = porcelain();
  if (dirty) {
    console.error(`ABORT: worktree is not clean ${when}:\n${dirty}`);
    process.exit(2);
  }
  console.error(`restored: clean (${when})`);
}

function runCheck(command: string): CheckResult {
  const r = spawnSync('sh', ['-c', command], { cwd: ROOT, stdio: 'ignore' });
  return { command, exitCode: r.status ?? 1 };
}

function main(): void {
  const only = process.argv.includes('--only')
    ? process.argv[process.argv.indexOf('--only') + 1]
    : undefined;
  const manifest: unknown = JSON.parse(readFileSync(resolve(DIR, 'manifest.json'), 'utf8'));
  const errors = validateManifest(manifest, p => existsSync(resolve(DIR, p)));
  if (errors.length > 0) {
    console.error(`Invalid manifest:\n${errors.join('\n')}`);
    process.exit(2);
  }
  const mutants = (manifest as Mutant[]).filter(m => !only || m.id.includes(only));
  assertClean('before baseline');

  const red = baselineRed(uniqueChecks(mutants).map(runCheck));
  if (red.length > 0) {
    console.error(
      `ABORT: checks are red on the clean tree, so every mutant would read as caught:\n${red.map(r => `  ${r.command}`).join('\n')}`
    );
    process.exit(2);
  }

  const rows: Row[] = [];
  for (const mutant of mutants) {
    if (mutant.kind === 'ci') {
      rows.push({ mutant, verdict: 'ci-run', caughtBy: [] });
      continue;
    }
    const patch = resolve(DIR, mutant.patch);
    const applied = sh('git', ['apply', patch]);
    if (applied.status !== 0) {
      console.error(`ABORT: patch does not apply: ${mutant.patch}\n${applied.stderr}`);
      assertClean('after failed apply');
      process.exit(2);
    }
    let results: CheckResult[] = [];
    try {
      results = mutant.checks.map(runCheck);
    } finally {
      const reverted = sh('git', ['apply', '-R', patch]);
      if (reverted.status !== 0) {
        console.error(`ABORT: could not revert ${mutant.patch}\n${reverted.stderr}`);
        process.exit(2);
      }
    }
    assertClean(`after ${mutant.id}`);
    rows.push({
      mutant,
      verdict: classify(results),
      caughtBy: results.filter(r => r.exitCode !== 0).map(r => r.command),
    });
  }
  console.log(renderTable(rows));
  assertClean('end of run');
  console.log(
    `\n${rows.filter(r => r.verdict === 'missed').length} missed of ${rows.filter(r => r.verdict !== 'ci-run').length} local mutants.`
  );
}

main();

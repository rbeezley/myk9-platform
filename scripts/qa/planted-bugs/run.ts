/**
 * Planted-bug audit runner (MYK9-1653). Applies one hand-written mutant patch at a
 * time to THIS worktree, runs its checks, reverts it, and prints a results table.
 *
 *   pnpm qa:planted-bugs            (run from a clean worktree)
 *   pnpm qa:planted-bugs -- --only run-order   (substring match on mutant id)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  baselineRed,
  classify,
  classifyCheck,
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

const LOG_DIR = resolve(ROOT, '.logs/planted-bugs');
const CHECK_TIMEOUT_MS = Number(process.env.PLANTED_BUGS_CHECK_TIMEOUT_MS ?? 10 * 60 * 1000);

/** The patch currently applied to the tree, so a signal can revert it. */
let applied: string | undefined;

function revertApplied(): boolean {
  if (!applied) return true;
  const r = sh('git', ['apply', '-R', applied]);
  const ok = r.status === 0;
  console.error(
    ok ? `reverted ${applied}` : `FAILED to revert ${applied}; run: git apply -R "${applied}"`
  );
  if (ok) applied = undefined;
  return ok;
}

for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const) {
  process.on(signal, () => {
    revertApplied();
    console.error(`${signal}: tree is ${porcelain() ? 'DIRTY' : 'clean'}`);
    process.exit(code);
  });
}

function knownDirtyPatch(manifest: Mutant[]): string | undefined {
  return manifest.find(
    m => sh('git', ['apply', '-R', '--check', resolve(DIR, m.patch)]).status === 0
  )?.patch;
}

function assertClean(when: string, manifest: Mutant[] = []): void {
  const dirty = porcelain();
  if (dirty) {
    const known = knownDirtyPatch(manifest);
    console.error(`ABORT: worktree is not clean ${when}:\n${dirty}`);
    if (known) {
      console.error(
        `A mutant patch is still applied. Restore with: git apply -R "${resolve(DIR, known)}"`
      );
    }
    process.exit(2);
  }
  console.error(`restored: clean (${when})`);
}

function runCheck(command: string, logName: string): CheckResult {
  const r = spawnSync('sh', ['-c', command], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: CHECK_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  mkdirSync(LOG_DIR, { recursive: true });
  writeFileSync(resolve(LOG_DIR, `${logName}.log`), `$ ${command}\n${output}`);
  const timedOut = (r.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';
  return { command, exitCode: r.status, signal: r.signal, timedOut, output };
}

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').slice(0, 80);

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
  if (mutants.length === 0) {
    console.error(`ABORT: no mutant id contains "${only}"`);
    process.exit(2);
  }
  assertClean('before baseline', manifest as Mutant[]);

  const red = baselineRed(
    uniqueChecks(mutants).map((c, i) => runCheck(c, `baseline-${i}-${slug(c)}`))
  );
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
    const attempt = sh('git', ['apply', patch]);
    if (attempt.status !== 0) {
      console.error(`ABORT: patch does not apply: ${mutant.patch}\n${attempt.stderr}`);
      assertClean('after failed apply');
      process.exit(2);
    }
    applied = patch;
    let results: CheckResult[] = [];
    try {
      results = mutant.checks.map((c, i) => runCheck(c, `${slug(mutant.id)}-${i}`));
    } finally {
      if (!revertApplied()) process.exit(2);
    }
    assertClean(`after ${mutant.id}`);
    rows.push({
      mutant,
      verdict: classify(results),
      caughtBy: results.filter(r => classifyCheck(r) === 'caught').map(r => r.command),
    });
  }
  console.log(renderTable(rows));
  assertClean('end of run');
  console.log(
    `\n${rows.filter(r => r.verdict === 'missed').length} missed of ${rows.filter(r => r.verdict !== 'ci-run').length} local mutants.`
  );
}

main();

/**
 * Planted-bug audit runner (MYK9-1653). Applies one hand-written mutant patch at a
 * time to THIS worktree, runs its checks, reverts it, and prints a results table.
 *
 *   pnpm qa:planted-bugs            (run from a clean worktree)
 *   pnpm qa:planted-bugs -- --only run-order   (substring match on mutant id)
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    if (child) killGroup(child);
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

let child: ChildProcess | undefined;

/** Kill the check and everything it spawned (vitest workers), not just the shell. */
function killGroup(proc: ChildProcess): void {
  try {
    process.kill(-proc.pid!, 'SIGKILL');
  } catch {
    proc.kill('SIGKILL');
  }
}

/**
 * Async (not spawnSync) so a SIGINT/SIGTERM handler can run while a check is in flight.
 * The verdict comes from vitest's JSON report, never the exit code.
 */
function runCheck(command: string, logName: string): Promise<CheckResult> {
  return new Promise(done => {
    mkdirSync(LOG_DIR, { recursive: true });
    const reportPath = resolve(LOG_DIR, `${logName}.json`);
    rmSync(reportPath, { force: true });
    const full = `${command} --reporter=default --reporter=json --outputFile="${reportPath}"`;
    let output = '';
    let timedOut = false;
    const proc = spawn('sh', ['-c', full], { cwd: ROOT, detached: true });
    child = proc;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(proc);
    }, CHECK_TIMEOUT_MS);
    proc.stdout.on('data', d => (output += d));
    proc.stderr.on('data', d => (output += d));
    const finish = (signal: string | null) => {
      clearTimeout(timer);
      child = undefined;
      writeFileSync(resolve(LOG_DIR, `${logName}.log`), `$ ${full}\n${output}`);
      const report = existsSync(reportPath) ? readFileSync(reportPath, 'utf8') : null;
      done({ command, signal, timedOut, report });
    };
    proc.on('close', (_code, signal) => finish(signal));
    proc.on('error', err => {
      output += String(err);
      finish(null);
    });
  });
}

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').slice(0, 80);

async function main(): Promise<void> {
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : undefined;
  if (onlyIdx >= 0 && (!only || only.startsWith('--'))) {
    console.error('ABORT: --only needs a value (substring of a mutant id)');
    process.exit(2);
  }
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

  const baseline: CheckResult[] = [];
  for (const [i, c] of uniqueChecks(mutants).entries()) {
    baseline.push(await runCheck(c, `baseline-${i}-${slug(c)}`));
  }
  const red = baselineRed(baseline);
  if (red.length > 0) {
    console.error(
      `ABORT: checks do not all pass with at least one test on the clean tree (logs in .logs/planted-bugs/):\n${red.map(r => `  ${r.command}`).join('\n')}`
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
      for (const [i, c] of mutant.checks.entries()) {
        results.push(await runCheck(c, `${slug(mutant.id)}-${i}`));
      }
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
  const count = (v: string) => rows.filter(r => r.verdict === v).length;
  console.log(
    `\n${count('caught')} caught, ${count('missed')} missed, ${count('error')} error of ${rows.filter(r => r.verdict !== 'ci-run').length} local mutants (logs in .logs/planted-bugs/).`
  );
}

void main();

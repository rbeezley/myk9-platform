/**
 * `--kind ci` mode of the planted-bug runner (MYK9-1659): the SQL mutants that
 * cannot run on a dev Mac (no container runtime) and so run in the
 * planted-bugs-sql workflow against that job's own throwaway Supabase stack.
 *
 * How a mutant reaches the database. The patch edits a migration file, which does
 * nothing to a database that `supabase db reset` already built. Re-running the
 * whole migration is not an option either: it adds columns, triggers and views
 * that already exist. A `db reset` per mutant would be faithful but costs minutes
 * a mutant. Every mutant instead patches ONE function body, so the runner
 * extracts that function's `CREATE OR REPLACE FUNCTION ... $$;` statement from
 * the patched file and applies it with psql (CREATE OR REPLACE keeps the ACL and
 * owner). Faithfulness is checked, not assumed: the function's md5 from
 * pg_get_functiondef must CHANGE once the mutant is applied and must EQUAL the
 * baseline again after the restore, or the run aborts.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  classifySqlCheck,
  combineOutcomes,
  extractFunctionDdl,
  firstSqlError,
  isLoopbackDatabaseUrl,
  patchedFiles,
  scrubPgEnv,
  splitSqlCheck,
  uniqueChecks,
  type CheckOutcome,
  type Mutant,
  type Row,
} from './lib';

const CHECK_TIMEOUT_MS = Number(process.env.PLANTED_BUGS_CHECK_TIMEOUT_MS ?? 10 * 60 * 1000);

interface Ctx {
  root: string;
  dir: string;
}

function abort(message: string): never {
  console.error(`ABORT: ${message}`);
  process.exit(2);
}

function psql(url: string, args: string[]) {
  // Bounded, so a restore cannot hang behind a stray transaction; scrubbed, so a
  // PGHOSTADDR or service file cannot redirect the loopback URL.
  return spawnSync('psql', [url, '-X', '-v', 'ON_ERROR_STOP=1', ...args], {
    encoding: 'utf8',
    env: { ...scrubPgEnv(process.env), PGOPTIONS: '-c lock_timeout=30s -c statement_timeout=120s' },
  });
}

function functionHash(url: string, signature: string): string {
  const r = psql(url, [
    '-At',
    '-c',
    `select md5(pg_get_functiondef('${signature}'::regprocedure))`,
  ]);
  const hash = r.stdout.trim();
  // Throws, never exits: this runs inside the try that holds an applied patch,
  // and process.exit would skip the finally that reverts and restores.
  if (r.status !== 0 || !/^[0-9a-f]{32}$/.test(hash)) {
    throw new Error(`could not read ${signature} from the database:\n${r.stderr}`);
  }
  return hash;
}

function applyDdl(url: string, ddl: string, scratch: string): boolean {
  const file = resolve(scratch, 'function.sql');
  writeFileSync(file, ddl);
  return psql(url, ['-1', '-f', file]).status === 0;
}

interface SqlCheckResult {
  outcome: CheckOutcome;
  /** First failing file and ERROR line, for the table. */
  evidence?: string | undefined;
}

/**
 * Async and detached so the SIGINT/SIGTERM handler in run.ts can run while a check
 * is in flight, and so a timeout kills the whole group (bash AND its psql, which
 * would otherwise keep its locks).
 */
function runSqlCheck(
  ctx: Ctx,
  url: string,
  check: string,
  logName: string
): Promise<SqlCheckResult> {
  const logDir = resolve(ctx.root, '.logs/planted-bugs');
  mkdirSync(logDir, { recursive: true });
  return new Promise(done => {
    const proc = spawn(
      'bash',
      [resolve(ctx.root, 'scripts/qa/run-behavioral-sql-tests.sh'), ...splitSqlCheck(check)],
      {
        cwd: ctx.root,
        detached: true,
        env: { ...scrubPgEnv(process.env), MYK9_BEHAVIORAL_SQL_DATABASE_URL: url },
      }
    );
    let output = '';
    let timedOut = false;
    const kill = () => {
      try {
        process.kill(-proc.pid!, 'SIGKILL');
      } catch {
        proc.kill('SIGKILL');
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, CHECK_TIMEOUT_MS);
    proc.stdout.on('data', d => (output += d));
    proc.stderr.on('data', d => (output += d));
    let finished = false;
    const finish = (exitCode: number | null, signal: string | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      writeFileSync(resolve(logDir, `${logName}.log`), output);
      const outcome = classifySqlCheck({ exitCode, signal, timedOut });
      done({ outcome, evidence: outcome === 'caught' ? firstSqlError(output) : undefined });
    };
    proc.on('close', finish);
    proc.on('error', err => {
      output += String(err);
      finish(null, null);
    });
  });
}

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').slice(0, 80);

/** The patched file that defines the mutant's function, and its definition before and after. */
function definitionsFor(ctx: Ctx, mutant: Mutant, patchPath: string) {
  const patch = readFileSync(patchPath, 'utf8');
  for (const file of patchedFiles(patch)) {
    const path = resolve(ctx.root, file);
    try {
      return {
        path,
        clean: extractFunctionDdl(readFileSync(path, 'utf8'), mutant.reapplyFunction!),
      };
    } catch {
      // Not this file; try the next one the patch touches.
    }
  }
  return abort(`${mutant.id}: no patched file defines ${mutant.reapplyFunction}`);
}

export async function runSqlMutants(
  ctx: Ctx,
  mutants: Mutant[],
  git: (...args: string[]) => { status: number | null; stderr: string },
  /** Tells run.ts which patch is applied, so its SIGINT/SIGTERM handler can revert it. */
  onApplied: (patch: string | undefined) => void
): Promise<Row[]> {
  const url = process.env.MYK9_BEHAVIORAL_SQL_DATABASE_URL ?? '';
  if (!isLoopbackDatabaseUrl(url)) {
    abort('MYK9_BEHAVIORAL_SQL_DATABASE_URL must be a local loopback database URL.');
  }
  const scratch = mkdtempSync(resolve(tmpdir(), 'planted-sql-'));
  try {
    for (const [i, c] of uniqueChecks(mutants, 'ci').entries()) {
      if ((await runSqlCheck(ctx, url, c, `baseline-${i}-${slug(c)}`)).outcome !== 'pass') {
        abort(
          `baseline check is not green on the clean database (logs in .logs/planted-bugs/): ${c}`
        );
      }
    }
    const rows: Row[] = [];
    for (const mutant of mutants) {
      const signature = mutant.reapplyFunction!;
      const baseline = functionHash(url, signature);
      const patchPath = resolve(ctx.dir, mutant.patch);
      const { path, clean } = definitionsFor(ctx, mutant, patchPath);
      if (git('apply', patchPath).status !== 0) abort(`patch does not apply: ${mutant.patch}`);
      onApplied(patchPath);
      const results: SqlCheckResult[] = [];
      try {
        const mutated = extractFunctionDdl(readFileSync(path, 'utf8'), signature);
        if (mutated === clean || !applyDdl(url, mutated, scratch)) {
          results.push({ outcome: 'error' });
        } else if (functionHash(url, signature) === baseline) {
          results.push({ outcome: 'error' });
        } else {
          for (const [i, c] of mutant.checks.entries()) {
            results.push(await runSqlCheck(ctx, url, c, `${slug(mutant.id)}-${i}`));
          }
        }
      } catch (err) {
        // Any failure while the mutant is live is an ERROR row, never an exit: the
        // finally below must still revert the patch and restore the function.
        console.error(`${mutant.id}: ${String(err)}`);
        results.push({ outcome: 'error' });
      } finally {
        if (git('apply', '-R', patchPath).status !== 0) {
          abort(`could not revert ${mutant.patch}; run: git apply -R "${patchPath}"`);
        }
        onApplied(undefined);
        let restored = false;
        try {
          restored = applyDdl(url, clean, scratch) && functionHash(url, signature) === baseline;
        } catch (err) {
          console.error(String(err));
        }
        if (!restored) {
          abort(
            `the database function was not restored after ${mutant.id}; later results would be void`
          );
        }
      }
      rows.push({
        mutant,
        verdict: combineOutcomes(results.map(r => r.outcome)),
        caughtBy: results.flatMap(r =>
          r.outcome === 'caught' ? [r.evidence ?? 'no ERROR line in log'] : []
        ),
      });
    }
    return rows;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

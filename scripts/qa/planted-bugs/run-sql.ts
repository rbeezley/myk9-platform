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
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  classifySqlCheck,
  combineOutcomes,
  extractFunctionDdl,
  isLoopbackDatabaseUrl,
  patchedFiles,
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
  return spawnSync('psql', [url, '-X', '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8' });
}

function functionHash(url: string, signature: string): string {
  const r = psql(url, [
    '-At',
    '-c',
    `select md5(pg_get_functiondef('${signature}'::regprocedure))`,
  ]);
  const hash = r.stdout.trim();
  if (r.status !== 0 || !/^[0-9a-f]{32}$/.test(hash)) {
    abort(`could not read ${signature} from the database:\n${r.stderr}`);
  }
  return hash;
}

function applyDdl(url: string, ddl: string, scratch: string): boolean {
  const file = resolve(scratch, 'function.sql');
  writeFileSync(file, ddl);
  return psql(url, ['-1', '-f', file]).status === 0;
}

function runSqlCheck(ctx: Ctx, url: string, check: string, logName: string): CheckOutcome {
  const logDir = resolve(ctx.root, '.logs/planted-bugs');
  mkdirSync(logDir, { recursive: true });
  const r = spawnSync(
    'bash',
    [resolve(ctx.root, 'scripts/qa/run-behavioral-sql-tests.sh'), ...splitSqlCheck(check)],
    {
      cwd: ctx.root,
      encoding: 'utf8',
      timeout: CHECK_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      env: { ...process.env, MYK9_BEHAVIORAL_SQL_DATABASE_URL: url },
    }
  );
  writeFileSync(resolve(logDir, `${logName}.log`), `${r.stdout}\n${r.stderr}`);
  return classifySqlCheck({
    exitCode: r.status,
    signal: r.signal,
    timedOut: (r.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT',
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

export function runSqlMutants(
  ctx: Ctx,
  mutants: Mutant[],
  git: (...args: string[]) => { status: number | null; stderr: string }
): Row[] {
  const url = process.env.MYK9_BEHAVIORAL_SQL_DATABASE_URL ?? '';
  if (!isLoopbackDatabaseUrl(url)) {
    abort('MYK9_BEHAVIORAL_SQL_DATABASE_URL must be a local loopback database URL.');
  }
  const scratch = mkdtempSync(resolve(tmpdir(), 'planted-sql-'));
  try {
    for (const [i, c] of uniqueChecks(mutants, 'ci').entries()) {
      if (runSqlCheck(ctx, url, c, `baseline-${i}-${slug(c)}`) !== 'pass') {
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
      const outcomes: CheckOutcome[] = [];
      try {
        const mutated = extractFunctionDdl(readFileSync(path, 'utf8'), signature);
        if (mutated === clean) {
          outcomes.push('error');
        } else if (!applyDdl(url, mutated, scratch)) {
          outcomes.push('error');
        } else if (functionHash(url, signature) === baseline) {
          outcomes.push('error');
        } else {
          for (const [i, c] of mutant.checks.entries()) {
            outcomes.push(runSqlCheck(ctx, url, c, `${slug(mutant.id)}-${i}`));
          }
        }
      } finally {
        if (git('apply', '-R', patchPath).status !== 0) {
          abort(`could not revert ${mutant.patch}; run: git apply -R "${patchPath}"`);
        }
        if (!applyDdl(url, clean, scratch) || functionHash(url, signature) !== baseline) {
          abort(
            `the database function was not restored after ${mutant.id}; later results would be void`
          );
        }
      }
      rows.push({
        mutant,
        verdict: combineOutcomes(outcomes),
        caughtBy: outcomes.includes('caught') ? mutant.checks : [],
      });
    }
    return rows;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Postgres restart detection (MYK9-1271).
 *
 * `pg_postmaster_start_time()` is read in `prepare`, before the load, and again
 * after it. If it moved, the database restarted mid-run (an OOM kill on the
 * Micro instance, or a platform failover) and every number measured across the
 * restart describes two different servers. The run fails rather than reporting
 * latencies and error rates for a window that includes a cold cache and a
 * dropped connection pool.
 */

/** SQL whose single output line is the postmaster start time as UTC ISO text. */
export const POSTMASTER_START_SQL =
  'SELECT to_char(pg_postmaster_start_time() AT TIME ZONE \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\');';

export type PostmasterComparison =
  | { readonly status: 'unchanged'; readonly message: string }
  | { readonly status: 'restarted'; readonly message: string }
  | { readonly status: 'unverifiable'; readonly message: string };

function parseStart(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function comparePostmasterStart(
  before: string | undefined,
  after: string | undefined
): PostmasterComparison {
  const beforeMs = parseStart(before);
  const afterMs = parseStart(after);
  if (beforeMs === undefined || afterMs === undefined) {
    return {
      status: 'unverifiable',
      message: `Postgres restart check could not read both start times (before ${before?.trim() || 'missing'}, after ${after?.trim() || 'missing'}): no numbers.`,
    };
  }
  if (beforeMs !== afterMs) {
    return {
      status: 'restarted',
      message: `Postgres restarted during the run (before ${before?.trim()}, after ${after?.trim()}): no numbers.`,
    };
  }
  return {
    status: 'unchanged',
    message: `Postgres did not restart during the run (started ${before?.trim()}).`,
  };
}

export const POSTMASTER_READ_TIMEOUT_MS = 30_000;

type ExecFileLike = (
  file: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; encoding: 'utf8'; timeout: number; killSignal: 'SIGKILL' }
) => Promise<{ stdout: string }>;

/**
 * Reads the postmaster start time with every wait bounded: a connect deadline, a
 * statement deadline set in SQL (Supavisor need not forward PGOPTIONS), and a
 * hard child-process kill. A hung pooler must cost this read, never the job.
 * Resolves undefined on any failure so the caller reports it as unverifiable.
 */
export async function readPostmasterStart(
  env: NodeJS.ProcessEnv,
  run: ExecFileLike = promisify(execFile) as unknown as ExecFileLike
): Promise<string | undefined> {
  const databaseUrl = env.SUPABASE_DB_URL;
  if (!databaseUrl) return undefined;
  try {
    const result = await run(
      'psql',
      [
        databaseUrl,
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-At',
        '--quiet',
        '--command',
        'SET statement_timeout = 10000',
        '--command',
        POSTMASTER_START_SQL,
      ],
      {
        env: { ...env, PGPASSWORD: env.SUPABASE_DB_PASSWORD, PGCONNECT_TIMEOUT: '10' },
        encoding: 'utf8',
        timeout: POSTMASTER_READ_TIMEOUT_MS,
        killSignal: 'SIGKILL',
      }
    );
    return result.stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The gating failure for aggregation, or undefined when Postgres provably did
 * not restart. An artifact that carries no postmaster block is unverifiable, not
 * clean: the check exists precisely so silence cannot read as a pass.
 */
export function postmasterRestartFailure(artifact: {
  postmaster?: { before?: string; after?: string };
}): string | undefined {
  const comparison = comparePostmasterStart(
    artifact.postmaster?.before,
    artifact.postmaster?.after
  );
  return comparison.status === 'unchanged' ? undefined : comparison.message;
}

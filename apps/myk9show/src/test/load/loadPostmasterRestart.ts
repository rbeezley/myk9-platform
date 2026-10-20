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

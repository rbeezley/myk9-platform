/**
 * Server answers that say "not this time", not "never" (MYK9-2011, owner decision 6,
 * 2026-11-14). The server was reached and could not finish this attempt: the statement ran
 * out of time (57014), it lost a deadlock (40P01), or it failed with a plain 500 that names
 * no reason. A write that hits one of these keeps retrying with capped backoff and spends no
 * retry budget, so it never parks as refused.
 *
 * P0002 (no row found) is temporary for ONE write only: `ringside_update_entry`, where the
 * entry a score is written to can still arrive (a day-of-show entry whose own insert has not
 * synced yet). Every other P0002 (`ringside_update_class` on a class that is gone,
 * `set_class_judge` on a deleted person) is a missing row that will not come back, so it spends
 * the normal budget and refuses.
 *
 * Checked only after `isRetryableError`, so a code that is permanent for one RPC
 * (`RPC_PERMANENT_CODES`) still parks at once. 40001 is left out on purpose: it is the version
 * conflict, which the OCC path settles.
 */
const SERVER_TRANSIENT_CODES: ReadonlySet<string> = new Set(['57014', '40P01']);

/** RPCs whose P0002 means "the row is not here yet", not "the row is gone". */
const ROW_NOT_YET_SYNCED_RPCS: ReadonlySet<string> = new Set(['ringside_update_entry']);

export function isServerTransientError(
  error: unknown,
  mutation?: { rpc?: { name: string } | undefined }
): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, httpStatus } = error as { code?: unknown; httpStatus?: unknown };
  if (typeof code === 'string' && SERVER_TRANSIENT_CODES.has(code)) return true;
  if (code === 'P0002') {
    return mutation?.rpc !== undefined && ROW_NOT_YET_SYNCED_RPCS.has(mutation.rpc.name);
  }
  return httpStatus === 500 && (code === undefined || code === '');
}

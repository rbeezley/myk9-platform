import { isShortOnlyFailure } from '@myk9/replication';

/**
 * What a `syncAtShowData` operation tells a caller that needs to know whether
 * the show actually arrived (MYK9-1350). Replication syncs report a failure as
 * a `{ success: false }` result rather than a rejection, so a caller that only
 * awaits the operation cannot otherwise tell a finished hydration from one the
 * server cut short.
 */
export interface AtShowSyncOutcome {
  /** True only when the trials sync and every scope resolved without `success: false`. */
  success: boolean;
  /**
   * Set when not successful and every failed result is only a download that stayed short of
   * the server's count (MYK9-2254): not a volunteer-facing failure, so no warning for it.
   */
  shortOnly?: boolean;
}

/** The operation running per show, and whether it re-fetches every row. */
export interface AtShowSyncInFlight {
  operation: Promise<AtShowSyncOutcome>;
  forced: boolean;
}

/** A replication sync result; `undefined` and `{}` count as not failed. */
export function isSyncResultFailed(result: unknown): boolean {
  return (result as { success?: boolean } | null | undefined)?.success === false;
}

/**
 * Fold the settled scopes into one outcome. A rejected scope still throws, so
 * existing callers keep their rejection contract; a resolved scope that
 * reports `success: false` only turns the outcome unsuccessful.
 */
export function settledScopesOutcome(
  trialsResult: unknown,
  results: readonly PromiseSettledResult<unknown>[]
): AtShowSyncOutcome {
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  const failedValues = [
    trialsResult,
    ...results.map(result => (result as PromiseFulfilledResult<unknown>).value),
  ].filter(isSyncResultFailed);
  if (failedValues.length === 0) return { success: true };
  return failedValues.every(isShortOnlyFailure)
    ? { success: false, shortOnly: true }
    : { success: false };
}

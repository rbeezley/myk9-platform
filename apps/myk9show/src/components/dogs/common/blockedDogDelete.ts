/**
 * Recognising the one delete failure that has an override.
 *
 * `soft_delete_dog` refuses with SQLSTATE MK002 when a dog has live entries that
 * are paid or scored (migration 20260830190000). That refusal is the only delete
 * failure a platform admin can push past, via `force_delete_dog` — every other
 * failure (permission, network, missing row) is a genuine error with no
 * override. Telling them apart is what lets the bulk flow offer "Delete anyway"
 * for exactly the right subset.
 */

/** myK9 custom SQLSTATE raised by soft_delete_dog. */
export const MK_DOG_HAS_SETTLED_ENTRIES = 'MK002';

/**
 * Matches the refusal's message. Needed as well as the code because
 * `translateDogDbError` rewrites MK002 into a plain `Error` and does NOT carry
 * `code` forward — a failure routed through it would otherwise read as an
 * ordinary error and silently lose the override.
 */
const BLOCKED_MESSAGE = /paid or scored entr(?:y|ies)/i;

export function isBlockedByPaidOrScoredEntries(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === MK_DOG_HAS_SETTLED_ENTRIES) return true;
  return typeof message === 'string' && BLOCKED_MESSAGE.test(message);
}

export interface BulkFailure<T> {
  item: T;
  error: unknown;
}

export interface BlockedPartition<T> {
  /** Dogs the server refused over paid/scored entries — overridable by an admin. */
  blocked: T[];
  /** Everything else; these keep the ordinary error reporting. */
  otherFailures: Array<BulkFailure<T>>;
}

/**
 * Splits a bulk-dispatch failure list into the overridable subset and the rest,
 * preserving input order within each group.
 */
export function partitionBlockedDogs<T>(
  failures: ReadonlyArray<BulkFailure<T>>
): BlockedPartition<T> {
  const blocked: T[] = [];
  const otherFailures: Array<BulkFailure<T>> = [];

  for (const failure of failures) {
    if (isBlockedByPaidOrScoredEntries(failure.error)) {
      blocked.push(failure.item);
    } else {
      otherFailures.push(failure);
    }
  }

  return { blocked, otherFailures };
}

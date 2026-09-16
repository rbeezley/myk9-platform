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
 * The SQLSTATE is the whole test (MYK9-600).
 *
 * A message-shape fallback used to sit here, justified by a claim that
 * `translateDogDbError` drops `code`. It does drop it — but it is not on this
 * path. The only caller is the dogs bulk-delete bar, whose failures come from
 * `useDeleteDogMutation` -> `deleteDog` -> `createDatabaseError`, and that
 * carries `code` through verbatim. So the regex never fired on a real refusal
 * and could only ever fire on something else: an error whose text happens to
 * mention paid or scored entries would have been handed an admin force-delete
 * affordance it has no business being offered.
 */
export function isBlockedByPaidOrScoredEntries(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const { code } = error as { code?: unknown };
  return code === MK_DOG_HAS_SETTLED_ENTRIES;
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

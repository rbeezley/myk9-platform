/**
 * Pure fold/retry logic for bulk-dispatching an async action across many items.
 * Kept free of React/toast concerns so it's cheaply unit-testable; `useBulkDispatch.ts`
 * is the thin hook that wires this into toast + an in-flight latch.
 *
 * See openspec/changes/inline-bulk-actions-and-editable-status/design.md decision D3.
 */

export interface BulkDispatchOutcome<T> {
  succeeded: T[];
  failed: Array<{ item: T; error: unknown }>;
}

export interface BulkRetryOutcome<T> extends BulkDispatchOutcome<T> {
  /** Items that were newly ineligible on retry (per `applicableWhen`) — reported as skipped, not errored. */
  skipped: T[];
}

/**
 * How many item writes may be in flight at once.
 *
 * This used to be unbounded: `Promise.allSettled(items.map(runItem))` starts
 * every item immediately, so selecting a whole show and bulk-accepting fired one
 * HTTP write per entry, all at once -- hundreds of concurrent PATCHes against
 * the same table. That is the shape of the `ringside_update_entry` 40001
 * serialization storm that has already pushed staging past 80% CPU, and each
 * write also drives its own optimistic state patch on the client.
 *
 * Six is chosen to sit at the usual browser per-host connection limit, so the
 * requests are ones the browser would have serialized anyway. The bound changes
 * only HOW MANY run at once: every item still runs, results are still folded by
 * index, and the succeeded/failed outcome is identical.
 */
export const BULK_DISPATCH_CONCURRENCY = 6;

/**
 * Runs `runItem` over every item with at most `BULK_DISPATCH_CONCURRENCY` in
 * flight, and folds the results. Never rejects: a failing item is captured in
 * `failed`, exactly as `Promise.allSettled` did.
 */
export async function dispatchBulk<T>(
  items: readonly T[],
  runItem: (item: T) => Promise<void>
): Promise<BulkDispatchOutcome<T>> {
  const results: PromiseSettledResult<void>[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (let index = cursor++; index < items.length; index = cursor++) {
      try {
        await runItem(items[index] as T);
        results[index] = { status: 'fulfilled', value: undefined };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(BULK_DISPATCH_CONCURRENCY, items.length) }, worker)
  );
  const succeeded: T[] = [];
  const failed: Array<{ item: T; error: unknown }> = [];
  items.forEach((item, index) => {
    const result = results[index];
    if (result?.status === 'fulfilled') {
      succeeded.push(item);
    } else {
      failed.push({ item, error: result?.status === 'rejected' ? result.reason : undefined });
    }
  });
  return { succeeded, failed };
}

/**
 * Re-runs only the previously-failed items, first re-checking `applicableWhen` —
 * items that became ineligible since the first attempt (e.g. another user changed
 * their status) are reported as `skipped`, not re-attempted and not counted as errors.
 */
export async function retryFailedItems<T>(
  failedItems: readonly T[],
  applicableWhen: (item: T) => boolean,
  runItem: (item: T) => Promise<void>
): Promise<BulkRetryOutcome<T>> {
  const eligible = failedItems.filter(applicableWhen);
  const skipped = failedItems.filter(item => !applicableWhen(item));
  const { succeeded, failed } = await dispatchBulk(eligible, runItem);
  return { succeeded, failed, skipped };
}

export function errorReason(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  if (typeof error === 'string' && error.trim().length > 0) return error;
  // The repository's DatabaseError is a plain object (createDatabaseError returns
  // an object literal, not an Error instance), so also read a string `message` off
  // any error-like object — otherwise real DB failure reasons show as "Unknown error".
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) return message;
  }
  return 'Unknown error';
}

export interface BulkOutcomeSummary {
  /** True when every dispatched item succeeded. */
  fullSuccess: boolean;
  title: string;
  /** One line per failed item, e.g. "Dog Name (#12): permission denied". Undefined on full success. */
  details?: string[];
}

/** Formats a dispatch outcome into a single summary line plus optional per-item detail lines. */
export function summarizeBulkOutcome<T>(
  total: number,
  outcome: BulkDispatchOutcome<T>,
  getLabel: (item: T) => string
): BulkOutcomeSummary {
  if (outcome.failed.length === 0) {
    return {
      fullSuccess: true,
      title: total === 1 ? 'Updated 1 item' : `Updated all ${total} items`,
    };
  }
  return {
    fullSuccess: false,
    title: `${outcome.succeeded.length} of ${total} succeeded — ${outcome.failed.length} failed`,
    details: outcome.failed.map(({ item, error }) => `${getLabel(item)}: ${errorReason(error)}`),
  };
}

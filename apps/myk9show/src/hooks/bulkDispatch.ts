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

/** Runs `runItem` over every item via `Promise.allSettled` and folds the results. */
export async function dispatchBulk<T>(
  items: readonly T[],
  runItem: (item: T) => Promise<void>
): Promise<BulkDispatchOutcome<T>> {
  const results = await Promise.allSettled(items.map(item => runItem(item)));
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
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error.trim().length > 0) return error;
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

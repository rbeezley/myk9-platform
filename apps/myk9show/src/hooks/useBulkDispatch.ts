import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  dispatchBulk,
  retryFailedItems,
  summarizeBulkOutcome,
  type BulkDispatchOutcome,
} from './bulkDispatch';

export interface UseBulkDispatchOptions<T> {
  /** Human-readable label for a single item, used in per-item failure detail lines. */
  getLabel: (item: T) => string;
  /**
   * Re-checked before a retry attempt runs a failed item again — items that no
   * longer pass are reported as skipped rather than re-attempted. Defaults to
   * "always eligible" (every failed item is retried).
   */
  applicableWhen?: (item: T) => boolean;
}

export interface UseBulkDispatchResult<T> {
  /** Dispatches `runItem` across `items` via allSettled, then shows a summary toast. */
  run: (items: T[], runItem: (item: T) => Promise<void>) => Promise<BulkDispatchOutcome<T>>;
  /** True while a dispatch (initial or retry) is in flight — disable bulk controls on this. */
  isBusy: boolean;
}

/**
 * Shared bulk-dispatch helper (design.md decision D3): folds a `Promise.allSettled`
 * batch into succeeded/failed, shows one summary toast (full success, or partial
 * failure with counts + per-item reasons and a "Retry failed" action), and guards
 * against overlapping dispatches with a `useRef` in-flight latch (not `isBusy` state,
 * which lags a render behind — `isBusy` is exposed only for disabling UI controls).
 */
export function useBulkDispatch<T>({
  getLabel,
  applicableWhen,
}: UseBulkDispatchOptions<T>): UseBulkDispatchResult<T> {
  const inFlightRef = useRef(false);
  const [isBusy, setIsBusy] = useState(false);

  const showSummary = useCallback(
    (total: number, outcome: BulkDispatchOutcome<T>, runItem: (item: T) => Promise<void>) => {
      const summary = summarizeBulkOutcome(total, outcome, getLabel);
      if (summary.fullSuccess) {
        toast.success(summary.title);
        return;
      }
      toast.error(summary.title, {
        description: summary.details?.join('\n'),
        action: {
          label: 'Retry failed',
          onClick: () => {
            void retry(
              outcome.failed.map(({ item }) => item),
              runItem
            );
          },
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `retry` is declared below and stable per-render via useCallback closure
    [getLabel]
  );

  const retry = useCallback(
    async (failedItems: T[], runItem: (item: T) => Promise<void>): Promise<void> => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setIsBusy(true);
      try {
        const outcome = await retryFailedItems(
          failedItems,
          applicableWhen ?? (() => true),
          runItem
        );
        if (outcome.skipped.length > 0) {
          toast.info(
            outcome.skipped.length === 1
              ? '1 item is no longer eligible and was skipped'
              : `${outcome.skipped.length} items are no longer eligible and were skipped`
          );
        }
        const retriedCount = failedItems.length - outcome.skipped.length;
        if (retriedCount > 0) {
          showSummary(
            retriedCount,
            { succeeded: outcome.succeeded, failed: outcome.failed },
            runItem
          );
        }
      } finally {
        inFlightRef.current = false;
        setIsBusy(false);
      }
    },
    [applicableWhen, showSummary]
  );

  const run = useCallback(
    async (items: T[], runItem: (item: T) => Promise<void>): Promise<BulkDispatchOutcome<T>> => {
      if (inFlightRef.current) return { succeeded: [], failed: [] };
      inFlightRef.current = true;
      setIsBusy(true);
      try {
        const outcome = await dispatchBulk(items, runItem);
        showSummary(items.length, outcome, runItem);
        return outcome;
      } finally {
        inFlightRef.current = false;
        setIsBusy(false);
      }
    },
    [showSummary]
  );

  return { run, isBusy };
}

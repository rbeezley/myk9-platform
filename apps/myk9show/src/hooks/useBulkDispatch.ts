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

export interface BulkDispatchRunOptions<T> {
  /**
   * Builds an Undo action for the summary toast from the dispatch outcome. Called
   * once the outcome is known, so it can revert exactly the succeeded subset. Only
   * attached to the FULL-success toast — on partial failure the "Retry failed"
   * action is the more useful affordance and takes the single action slot. Return
   * `undefined` to show no Undo.
   */
  buildUndo?: (outcome: BulkDispatchOutcome<T>) => (() => void) | undefined;
  /**
   * Per-run eligibility re-check used when the user retries the failed subset.
   * Overrides the hook-level `applicableWhen` for this dispatch and its retries.
   * Use it when eligibility is specific to THIS invocation — e.g. a bulk "accept"
   * must not re-run on an entry another actor has since moved to a different status.
   * Items that no longer pass are reported as skipped rather than re-attempted.
   */
  applicableWhen?: (item: T) => boolean;
}

export interface UseBulkDispatchResult<T> {
  /**
   * Dispatches `runItem` across `items` via allSettled, then shows a summary toast.
   * Returns `null` when a prior batch is still in flight (latched no-op) — callers
   * MUST treat `null` as "nothing happened": no success handling, no selection clear.
   */
  run: (
    items: T[],
    runItem: (item: T) => Promise<void>,
    options?: BulkDispatchRunOptions<T>
  ) => Promise<BulkDispatchOutcome<T> | null>;
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
    (
      total: number,
      outcome: BulkDispatchOutcome<T>,
      runItem: (item: T) => Promise<void>,
      buildUndo?: (outcome: BulkDispatchOutcome<T>) => (() => void) | undefined,
      runApplicableWhen?: (item: T) => boolean
    ) => {
      const summary = summarizeBulkOutcome(total, outcome, getLabel);
      if (summary.fullSuccess) {
        const onUndo = buildUndo?.(outcome);
        toast.success(
          summary.title,
          onUndo ? { action: { label: 'Undo', onClick: onUndo } } : undefined
        );
        return;
      }
      toast.error(summary.title, {
        description: summary.details?.join('\n'),
        action: {
          label: 'Retry failed',
          onClick: () => {
            void retry(
              outcome.failed.map(({ item }) => item),
              runItem,
              runApplicableWhen,
              buildUndo
            );
          },
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `retry` is declared below and stable per-render via useCallback closure
    [getLabel]
  );

  const retry = useCallback(
    async (
      failedItems: T[],
      runItem: (item: T) => Promise<void>,
      runApplicableWhen?: (item: T) => boolean,
      buildUndo?: (outcome: BulkDispatchOutcome<T>) => (() => void) | undefined
    ): Promise<void> => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setIsBusy(true);
      try {
        // Prefer the per-run predicate (e.g. the specific target status of THIS
        // batch) over the generic hook-level one, so a retry can't overwrite a
        // decision another actor made in the meantime.
        const outcome = await retryFailedItems(
          failedItems,
          runApplicableWhen ?? applicableWhen ?? (() => true),
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
          // Forward `buildUndo` so a retry that fully succeeds still offers Undo
          // for the newly-succeeded subset (buildUndo reverts `outcome.succeeded`,
          // and the caller's prior-state map covers these items too).
          showSummary(
            retriedCount,
            { succeeded: outcome.succeeded, failed: outcome.failed },
            runItem,
            buildUndo,
            runApplicableWhen
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
    async (
      items: T[],
      runItem: (item: T) => Promise<void>,
      options?: BulkDispatchRunOptions<T>
    ): Promise<BulkDispatchOutcome<T> | null> => {
      // Latched no-op: an empty outcome would read as "full success" to callers
      // (0 failures → clear selection), so return null and let callers do nothing.
      if (inFlightRef.current) return null;
      inFlightRef.current = true;
      setIsBusy(true);
      try {
        const outcome = await dispatchBulk(items, runItem);
        showSummary(items.length, outcome, runItem, options?.buildUndo, options?.applicableWhen);
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

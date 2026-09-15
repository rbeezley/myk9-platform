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
  /** Called when this run or a retry of its failed subset fully succeeds. */
  onFullSuccess?: (() => void) | undefined;
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
  /**
   * Lets the caller take ownership of reporting a subset of failures, so the
   * summary toast stops reporting them. Claimed items are excluded from the
   * toast's count, its detail lines, and its "Retry failed" set; the full
   * outcome is still returned from `run`, so the caller can surface them its
   * own way.
   *
   * Use it when a specific failure has a specific resolution the user must act
   * on — a bulk dog delete refused over paid/scored entries offers an admin
   * override, and a list of names you must act on does not belong in a toast
   * that disappears. Everything else keeps the ordinary toast.
   *
   * When every failure is claimed and nothing succeeded, no toast is shown at
   * all: the caller's own UI is the entire report.
   */
  claimFailure?: (item: T, error: unknown) => boolean;
  /**
   * Receives the items `claimFailure` claimed, on the initial dispatch AND on
   * every retry. Without the retry half, an item whose retry comes back
   * claimable would be filtered out of the toast and never reach the caller —
   * the failure would vanish silently.
   */
  onClaimedFailures?: (items: T[]) => void;
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
      onFullSuccess?: () => void,
      runApplicableWhen?: (item: T) => boolean,
      claimFailure?: (item: T, error: unknown) => boolean,
      onClaimedFailures?: (items: T[]) => void
    ) => {
      // Failures the caller has claimed are reported by the caller's own UI, so
      // drop them here before anything is counted or worded. `total` shrinks
      // with them, otherwise the toast reads "1 of 3 succeeded" about a batch
      // the user is being shown two separate accounts of.
      const claimed = claimFailure
        ? outcome.failed.filter(({ item, error }) => claimFailure(item, error))
        : [];
      const reportable: BulkDispatchOutcome<T> = claimed.length
        ? {
            succeeded: outcome.succeeded,
            failed: outcome.failed.filter(f => !claimed.includes(f)),
          }
        : outcome;

      if (claimed.length > 0) onClaimedFailures?.(claimed.map(({ item }) => item));

      // Everything failed and the caller owns every failure: its dialog is the
      // whole report, so stay silent rather than stacking a toast on top of it.
      if (reportable.succeeded.length === 0 && reportable.failed.length === 0) return;

      const summary = summarizeBulkOutcome(total - claimed.length, reportable, getLabel);
      if (summary.fullSuccess) {
        // Only a genuinely clean batch clears the selection: claimed failures
        // are still unresolved, and their dogs must stay selected so the
        // override acts on them.
        if (claimed.length === 0) onFullSuccess?.();
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
              reportable.failed.map(({ item }) => item),
              runItem,
              runApplicableWhen,
              buildUndo,
              onFullSuccess,
              claimFailure,
              onClaimedFailures
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
      buildUndo?: (outcome: BulkDispatchOutcome<T>) => (() => void) | undefined,
      onFullSuccess?: () => void,
      claimFailure?: (item: T, error: unknown) => boolean,
      onClaimedFailures?: (items: T[]) => void
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
            onFullSuccess,
            runApplicableWhen,
            claimFailure,
            onClaimedFailures
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
        showSummary(
          items.length,
          outcome,
          runItem,
          options?.buildUndo,
          options?.onFullSuccess,
          options?.applicableWhen,
          options?.claimFailure,
          options?.onClaimedFailures
        );
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

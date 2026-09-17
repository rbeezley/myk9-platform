import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  dispatchBulk,
  errorReason,
  retryFailedItems,
  summarizeBulkOutcome,
  type BulkDispatchOutcome,
} from './bulkDispatch';

/**
 * Shown in place of a swallowed retry. The latch is held for the length of one
 * batch, so "in a moment" is honest — the same toast keeps its Retry action.
 */
const BUSY_RETRY_NOTE = 'Still working on the previous batch; retry once it finishes.';

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
   * Lets the caller take ownership of reporting a subset of failures in its own
   * UI. Claimed items are excluded from the toast's DETAIL LINES and its "Retry
   * failed" set, so the two reports do not duplicate each other.
   *
   * Claiming does NOT reduce the toast's counts, and it never suppresses the
   * toast — see MYK9-584. An earlier version stayed silent when every failure
   * was claimed, and shipped a bulk delete that reported nothing at all once the
   * caller's dialog turned out to be unmountable at that moment. The toast is
   * the only report that does not depend on a caller's render tree surviving.
   *
   * Use it when a specific failure has a specific resolution the user must act
   * on — a bulk dog delete refused over paid/scored entries offers an admin
   * override, and a list of names you must act on does not belong in a toast
   * that disappears.
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
      // A claimed failure is one the caller reports itself (e.g. in a dialog).
      // Claiming removes it from the DETAIL LINES and the retry set so the two
      // reports do not duplicate each other — it must never remove the toast.
      //
      // MYK9-584: this used to return early and show nothing when every failure
      // was claimed. In production that produced a bulk delete with no feedback
      // at all, because the caller's dialog lived in a component the optimistic
      // update had already unmounted. The toast is the one report that does not
      // depend on any caller's render tree still existing, so it always fires.
      const claimed = claimFailure
        ? outcome.failed.filter(({ item, error }) => claimFailure(item, error))
        : [];
      const unclaimed = claimed.length
        ? outcome.failed.filter(f => !claimed.includes(f))
        : outcome.failed;

      if (claimed.length > 0) onClaimedFailures?.(claimed.map(({ item }) => item));

      // Counts come from the FULL outcome: "1 of 3 succeeded — 2 failed" stays
      // true regardless of who reports the two.
      const summary = summarizeBulkOutcome(total, outcome, getLabel);
      if (summary.fullSuccess) {
        onFullSuccess?.();
        const onUndo = buildUndo?.(outcome);
        toast.success(
          summary.title,
          onUndo ? { action: { label: 'Undo', onClick: onUndo } } : undefined
        );
        return;
      }

      const details = unclaimed.map(
        ({ item, error }) => `${getLabel(item)}: ${errorReason(error)}`
      );
      const retryable = unclaimed.map(({ item }) => item);

      // Sonner dismisses a toast when its action is clicked, and `retry` is a
      // latched no-op while another batch is in flight. MYK9-593: clicking
      // "Retry failed" during a second batch therefore took the failure report
      // away and put nothing in its place. Re-show the SAME toast (same id, so
      // it replaces rather than stacks; same details, same action) with a line
      // saying why nothing ran — a note in a fresh info toast would lose the
      // list of what actually failed.
      let toastId: string | number | undefined;
      const showFailureToast = (note?: string) => {
        const description = (note ? [note, ...details] : details).join('\n');
        toastId = toast.error(summary.title, {
          ...(toastId !== undefined ? { id: toastId } : {}),
          ...(description.length > 0 ? { description } : {}),
          // No retry when every failure was claimed: retrying them is the
          // caller's affordance, not a generic re-run of the same rejection.
          ...(retryable.length > 0
            ? {
                action: {
                  label: 'Retry failed',
                  onClick: () => {
                    if (inFlightRef.current) {
                      showFailureToast(BUSY_RETRY_NOTE);
                      return;
                    }
                    void retry(
                      retryable,
                      runItem,
                      runApplicableWhen,
                      buildUndo,
                      onFullSuccess,
                      claimFailure,
                      onClaimedFailures
                    );
                  },
                },
              }
            : {}),
        });
      };
      showFailureToast();
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

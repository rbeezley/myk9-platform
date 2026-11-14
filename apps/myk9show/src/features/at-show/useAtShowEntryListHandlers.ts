/**
 * Phase 1a — myK9Show host implementation of ringside's `EntryListHandlers`
 * (the 22-method handler bag). Mostly UI-state delegation + thin wrappers over
 * `EntryListActions`; the service-coupled methods are stubbed for the spike
 * per the service-layer audit + DB checks. Modeled on myK9Q's
 * `useEntryListHandlers` (pattern, not copy).
 *
 * REAL: routing, status popup/reset-menu UI state, status change delegation,
 *   in-ring set, manual/hard refresh, class-status dialog (→ replication
 *   adapter), drag-mode toggle.
 * STUB (spike, INTENT-noted): run-order apply (`run_order` write deferred),
 *   placement recalc (myK9Show uses a different calculator), print reports,
 *   statistics nav.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction, MouseEvent as ReactMouseEvent } from 'react';
import type {
  EntryListHandlers,
  EntryListActions,
  EntryStatusChange,
  EntryStatusCheckIn,
  RunOrderPreset,
  RingsideReplication,
  Entry,
} from '@myk9/ringside';
import { toast } from 'sonner';
import { isStaleCheckIn, type CheckInWriter } from '@/services/show-day/checkInStatus';
import { offerPullUndo } from './offerPullUndo';
import { logger } from '@/utils/logger';
import { supabase } from '@/services/database/supabaseClient';
import { calculateRunOrder, storedRunOrder, toMyK9ShowRunOrderPreset } from '@/lib/runOrderUtils';
import { notifyRunOrderPersistError } from './runOrderErrorToast';
import { persistRunOrderResults } from './persistRunOrderResults';
import { toStatusUpdateFields } from './ringsideClassStatusMap';
import { CANCELLED_CLASS_MESSAGE } from './cancelledClassGuard';
import { useAtShowResetHandlers, type ResetConfirmState } from './useAtShowResetHandlers';
import { SELF_CHECKIN_REFUSED_MESSAGE, isSelfCheckinRefusal } from './entryStatusAccess';

/** `handleStatusChange`, plus a flag marking the write as an exhibitor's Pull Undo (MYK9-1911). */
type StatusChangeHandler = (
  entryId: string,
  status: EntryStatusChange,
  undoOfPull?: { pullVersion?: number | undefined } | undefined
) => Promise<void>;

export interface UseAtShowEntryListHandlersDeps {
  /** Mutation bag from `useAtShowEntryListActions`. */
  actions: EntryListActions & {
    writer?: CheckInWriter | undefined;
    /** Exhibitor Pull Undo that the server refuses when a newer status superseded the Pull. */
    handleUndoPull?:
      | ((entryId: string, prior: EntryStatusCheckIn, pullVersion?: number) => Promise<void>)
      | undefined;
    /** The entry version the exhibitor's latest write produced (the Pull's identity). */
    lastWriteVersion?: ((entryId: string) => number | undefined) | undefined;
  };
  /** Replication capability (for the class-status dialog). */
  replication: RingsideReplication;
  /** Route param. */
  classId: string | undefined;
  /** Current (optimistically-updated) entries — read for the cancelled-class check. */
  localEntries: Entry[];
  /** Permission predicate (already narrowed from RBAC by the auth adapter). */
  hasPermission: (permission: 'canScore') => boolean;
  /** react-router navigate. */
  navigate: (to: string, options?: { state?: unknown }) => void;
  /** Build the scoresheet route for an entry (wired fully in Phase 1h). */
  buildScoreSheetRoute: (entry: Entry) => string;
  /**
   * MYK9-1099: true when the tap must open Set Max Time instead of the scoresheet
   * (a judge-set class with no max time yet). See useMaxTimeGate.
   */
  gateEntryClick?: () => boolean;
  /**
   * MYK9-1847: whether a class is cancelled, decided per entry from `entry.classId` (a combined
   * A/B list spans two classes). Scoring, check-in and in-ring changes are not offered for a
   * cancelled class; a tap says so instead. Re-evaluated on each render, so changing the
   * status back restores them.
   */
  isClassCancelled?: (classId: string) => boolean;
  /**
   * MYK9-1807: why this viewer may not set `status` on this entry (entryStatusAccess.ts), or null.
   * A change it refuses is turned away with that message before anything is sent or shown.
   * Omitted allows all.
   */
  statusRefusalFor?: (entry: Entry, status: string) => string | null;
  /** Force-refresh from the data hook. */
  refresh: (forceSync?: boolean) => Promise<void>;
  /** Manual refresh control: syncs and records the done/failed/offline answer (MYK9-1746). */
  manualRefresh: () => Promise<void>;

  // Shim-owned UI-state setters (subset the handlers drive).
  setActiveStatusPopup: Dispatch<SetStateAction<string | null>>;
  setActiveResetMenu: Dispatch<SetStateAction<string | null>>;
  setResetMenuPosition: Dispatch<SetStateAction<{ top: number; left: number } | null>>;
  setResetConfirmDialog: Dispatch<SetStateAction<ResetConfirmState>>;
  setIsDragMode: Dispatch<SetStateAction<boolean>>;
  setIsManualRefreshing: Dispatch<SetStateAction<boolean>>;
  setActiveTab: (tab: 'pending' | 'completed') => void;
  setLocalEntries: Dispatch<SetStateAction<Entry[]>>;
}

const NEVER_CANCELLED = () => false;

export function useAtShowEntryListHandlers(
  deps: UseAtShowEntryListHandlersDeps
): EntryListHandlers {
  const {
    actions,
    replication,
    localEntries,
    hasPermission,
    navigate,
    buildScoreSheetRoute,
    gateEntryClick,
    isClassCancelled = NEVER_CANCELLED,
    statusRefusalFor,
    refresh,
    manualRefresh,
    setActiveStatusPopup,
    setActiveResetMenu,
    setResetMenuPosition,
    setResetConfirmDialog,
    setIsDragMode,
    setIsManualRefreshing,
    setActiveTab,
    setLocalEntries,
  } = deps;

  // Mirror the latest entries into a ref so id-only handlers read the freshest
  // committed snapshot instead of a stale closure capture — rapid taps fire
  // handlers bound to the same render.
  const entriesRef = useRef(localEntries);
  useEffect(() => {
    entriesRef.current = localEntries;
  }, [localEntries]);

  // MYK9-1847: handlers that take only an entry id find its class from the latest entries.
  const isEntryCancelled = useCallback(
    (entryId: string) => {
      const row = entriesRef.current.find(e => e.id === entryId);
      return row ? isClassCancelled(row.classId) : false;
    },
    [isClassCancelled]
  );

  // ── Entry tap ────────────────────────────────────────────────────────
  const handleEntryClick = useCallback<EntryListHandlers['handleEntryClick']>(
    entry => {
      if (isClassCancelled(entry.classId)) {
        toast.info(CANCELLED_CLASS_MESSAGE);
        return;
      }
      if (entry.isScored) {
        // Was a SILENT return. A judge who spots a typo two dogs later taps the
        // card -- the obvious action -- and nothing happens at all: no
        // navigation, no message, indistinguishable from a missed tap or a
        // frozen app. Say what the state is and where the correction lives.
        //
        // Deliberately not routed to the scoresheet: `toScoresheetEntry` maps
        // identity only, so the sheet would open BLANK rather than pre-filled,
        // making it a re-score from nothing with the existing value invisible.
        // Turning a dead tap into a silent-overwrite path is not an improvement.
        // Wiring a real correction flow is a product decision, filed separately.
        toast.info(`${entry.callName} is already scored — use the card's ⋯ menu to change it.`);
        return;
      }
      if (!hasPermission('canScore')) {
        toast.error('You do not have permission to score entries.');
        return;
      }
      if (gateEntryClick?.()) return;
      // INTENT: A card tap is a view/navigation intent. It must not enqueue a
      // ringside status mutation; explicit in-ring controls own that write.
      navigate(buildScoreSheetRoute(entry));
    },
    [isClassCancelled, hasPermission, navigate, buildScoreSheetRoute, gateEntryClick]
  );

  // INTENT (spike): no prefetch cache in myK9Show yet — pure no-op.
  const handleEntryPrefetch = useCallback<EntryListHandlers['handleEntryPrefetch']>(() => {}, []);

  // ── Status mutations (delegate, optimistically) ──────────────────────
  // The mirror is updated BEFORE the write and rolled back if it throws.
  //
  // For a judge or steward this is only a few hundred milliseconds of polish:
  // the write lands in the replicated store, so the `refresh()` inside
  // `actions` re-reads it and the card settles either way.
  //
  // For an EXHIBITOR it is the whole thing. That role writes through
  // `self_checkin_entry`, a bare RPC that never touches the replicated store,
  // so the refresh re-reads a cache that has not heard about the change and the
  // card snaps back to its old status. The dog is checked in on the server and
  // the exhibitor cannot tell -- so they tap again.
  //
  // The combined A/B page used to carry its own copy of this and the
  // single-class route never had one, which is how a bug that reproduces on
  // both went unnoticed on one. Fixing it here covers both (MYK9-260).
  //
  // NOTE: this does NOT make the exhibitor's status survive a reload -- only a
  // real write into the replicated store would, and that path is blocked for
  // exhibitors by design. Tracked separately.
  const handleStatusChangeRef = useRef<StatusChangeHandler | null>(null);
  const handleStatusChange = useCallback<StatusChangeHandler>(
    async (entryId, status: EntryStatusChange, undoOfPull) => {
      setActiveStatusPopup(null);
      if (isEntryCancelled(entryId)) {
        toast.info(CANCELLED_CLASS_MESSAGE);
        return;
      }

      const previous = entriesRef.current.find(entry => entry.id === entryId);
      const refusal = previous && statusRefusalFor ? statusRefusalFor(previous, status) : null;
      if (refusal) {
        toast.error(refusal);
        return;
      }
      setLocalEntries(prev =>
        prev.map(entry =>
          entry.id === entryId
            ? {
                ...entry,
                status,
                checkedIn: status !== 'no-status',
                ...(status === 'completed' ? { isScored: true } : {}),
              }
            : entry
        )
      );

      const rollback = () => {
        if (!previous) return;
        setLocalEntries(prev => prev.map(entry => (entry.id === entryId ? previous : entry)));
      };

      try {
        if (status === 'in-ring') {
          await actions.handleMarkInRing(entryId);
          return;
        }
        if (status === 'completed') {
          await actions.handleMarkCompleted(entryId);
          return;
        }
        if (undoOfPull && actions.handleUndoPull) {
          await actions.handleUndoPull(entryId, status, undoOfPull.pullVersion);
          return;
        }
        await actions.handleStatusChange(entryId, status);
        if (status === 'pulled') {
          // Read now: a later write to this entry replaces it, and the Undo names THIS Pull.
          const pullVersion = actions.lastWriteVersion?.(entryId);
          offerPullUndo(previous, actions.writer, prior =>
            handleStatusChangeRef.current?.(entryId, prior, { pullVersion })
          );
        }
      } catch (error) {
        // Showing a status the server rejected is worse than showing none: the
        // gate would be worked from a check-in that does not exist.
        rollback();
        // The Pull Undo's own guard turns this refusal into the plain-words notice.
        if (undoOfPull && isStaleCheckIn(error)) {
          // The dog changed on another device. The rollback above shows our old local copy; a
          // forced sync pulls the newer status and the page mirrors it over that copy. Sync
          // AFTER the rollback so nothing stale lands on top. Offline: keep the rolled-back card.
          try {
            await refresh(true);
          } catch (syncError) {
            logger.warn('[at-show] sync after a refused Undo failed', 'at-show', {
              error: String(syncError),
            });
          }
          throw error;
        }
        // The server turned the change away (not their dog, or check-in went off meanwhile): say
        // so in plain words. The writer already kept it off the "could not be sent" pill.
        if (isSelfCheckinRefusal(error)) toast.error(SELF_CHECKIN_REFUSED_MESSAGE);
        logger.error('[at-show] status change failed', 'at-show', { error: String(error) });
      }
    },
    [actions, isEntryCancelled, statusRefusalFor, setActiveStatusPopup, setLocalEntries, refresh]
  );

  useEffect(() => {
    handleStatusChangeRef.current = handleStatusChange;
  }, [handleStatusChange]);

  const handleStatusClick = useCallback<EntryListHandlers['handleStatusClick']>(
    (e: ReactMouseEvent, entryId) => {
      e.preventDefault();
      e.stopPropagation();
      if (isEntryCancelled(entryId)) {
        toast.info(CANCELLED_CLASS_MESSAGE);
        return;
      }
      setActiveStatusPopup(entryId);
    },
    [isEntryCancelled, setActiveStatusPopup]
  );

  const resetHandlers = useAtShowResetHandlers({
    actions,
    isClassCancelled,
    refresh,
    setActiveResetMenu,
    setResetMenuPosition,
    setResetConfirmDialog,
    setActiveTab,
  });

  // ── Run order ────────────────────────────────────────────────────────
  const handleOpenDragMode = useCallback<EntryListHandlers['handleOpenDragMode']>(() => {
    setIsDragMode(true);
  }, [setIsDragMode]);

  const handleApplyRunOrder = useCallback<EntryListHandlers['handleApplyRunOrder']>(
    async (preset: RunOrderPreset) => {
      if (preset === 'manual') {
        setIsDragMode(true);
        // Opens drag mode; nothing is persisted until the steward drops.
        return false;
      }
      // Compute the preset order with the shared myK9Show helper, then persist
      // each entry's new run_order. run_order is ringside-whitelisted, so
      // updateEntry auto-routes through ringside_update_entry. refresh() re-pulls
      // so the list re-sorts into the new order.
      const results = calculateRunOrder(
        localEntries.map(e => ({
          id: e.id,
          armband: e.armband != null ? String(e.armband) : null,
          section: e.section ?? null,
          runOrder: storedRunOrder(e),
        })),
        // Translate the wide ringside preset to myK9Show's supported set —
        // notably ringside 'random-all' → 'random'. A bare cast let 'random-all'
        // fall through to deterministic armband order.
        toMyK9ShowRunOrderPreset(preset)
      );
      try {
        await persistRunOrderResults(results, localEntries);
      } catch (error) {
        // The single-class RunOrderDialog fires this fire-and-forget (`void
        // onApplyOrder(...)`), so a re-throw would surface as an unhandled
        // rejection. Surface the failure as a toast and report it to the caller
        // through the RETURN value instead — returning normally here is what let
        // the page congratulate a steward on an order that was never saved.
        notifyRunOrderPersistError(error);
        return false;
      }
      // The write landed — re-pull is best-effort reconciliation, kept OUT of the
      // try so a refresh hiccup can't read as a failed apply (false error toast).
      await refresh();
      return true;
    },
    [localEntries, refresh, setIsDragMode]
  );

  // ── Refresh ──────────────────────────────────────────────────────────
  const handleManualRefresh = useCallback<EntryListHandlers['handleManualRefresh']>(async () => {
    setIsManualRefreshing(true);
    try {
      await Promise.all([manualRefresh(), new Promise(resolve => setTimeout(resolve, 500))]);
    } finally {
      setIsManualRefreshing(false);
    }
  }, [manualRefresh, setIsManualRefreshing]);

  // ── Class-status dialog (real via replication adapter) ───────────────
  const handleStatusDialogChange = useCallback<EntryListHandlers['handleStatusDialogChange']>(
    async (status, timeValue) => {
      // ringside passes its own status string; the replication adapter maps it
      // to a class status + ring phase, and the time to the field that status owns.
      const ringsideStatus = status as Parameters<RingsideReplication['updateClassStatus']>[1];
      await replication.updateClassStatus(
        deps.classId ?? '',
        ringsideStatus,
        toStatusUpdateFields(ringsideStatus, timeValue)
      );
    },
    [replication, deps.classId]
  );

  // ── Spike stubs (service-coupled, deferred) ──────────────────────────
  const handleRecalculatePlacements = useCallback<
    EntryListHandlers['handleRecalculatePlacements']
  >(async () => {
    const classId = deps.classId;
    if (!classId) return;
    // refresh_class_scoring_state is the SAME server-side routine the scoring
    // trigger runs: it derives is_nationals, recomputes final_placement for a
    // fully-scored class (or clears stale placements otherwise) and updates the
    // class status. Server-authoritative and DRY — no client placement math, and
    // placements already recompute automatically on each score write, so this is
    // a manual backstop. The RPC is SECURITY DEFINER, but mirrors ringside
    // scoring auth before invoking the internal trigger routine.
    try {
      const { error } = await supabase.rpc('refresh_class_scoring_state_authorized', {
        p_class_id: classId,
      });
      if (error) throw error;
      await refresh(true);
    } catch (error) {
      logger.error('[at-show] recalculate placements failed', 'at-show', {
        error: String(error),
      });
      toast.error(
        typeof navigator !== 'undefined' && !navigator.onLine
          ? "Couldn't recalculate placements while offline. Reconnect and try again."
          : "Couldn't recalculate placements. Check your connection and try again."
      );
    }
  }, [deps, refresh]);

  // Statistics opens from ClassOptionsDialog itself (ClassStatisticsDialog reads the
  // replicated entries), so the page has nothing to do. The contract requires the
  // handler; its presence is only what shows the tile.
  const handleStatisticsClick = useCallback<
    EntryListHandlers['handleStatisticsClick']
  >(() => {}, []);

  // Silence unused-in-spike setter (kept in deps for parity with the shim).
  void setLocalEntries;

  return {
    handleEntryClick,
    handleEntryPrefetch,
    handleStatusChange,
    handleStatusClick,
    ...resetHandlers,
    handleApplyRunOrder,
    handleOpenDragMode,
    handleManualRefresh,
    handleRecalculatePlacements,
    handleStatusDialogChange,
    handleStatisticsClick,
  };
}

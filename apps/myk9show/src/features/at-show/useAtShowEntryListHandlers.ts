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
 *   statistics nav, the max-time gate inside handleEntryClick.
 */

import { useCallback } from 'react';
import type { Dispatch, SetStateAction, MouseEvent as ReactMouseEvent } from 'react';
import type {
  EntryListHandlers,
  EntryListActions,
  EntryStatusChange,
  LongPressHandlers,
  RunOrderPreset,
  RingsideReplication,
  Entry,
} from '@myk9/ringside';
import { logger } from '@/utils/logger';

type ResetConfirmState = { show: boolean; entry: Entry | null };

export interface UseAtShowEntryListHandlersDeps {
  /** Mutation bag from `useAtShowEntryListActions`. */
  actions: EntryListActions;
  /** Replication capability (for the class-status dialog). */
  replication: RingsideReplication;
  /** Route param. */
  classId: string | undefined;
  /** Current (optimistically-updated) entries — used by setDogInRingStatus. */
  localEntries: Entry[];
  /** Permission predicate (already narrowed from RBAC by the auth adapter). */
  hasPermission: (permission: 'canScore') => boolean;
  /** react-router navigate. */
  navigate: (to: string) => void;
  /** Build the scoresheet route for an entry (wired fully in Phase 1h). */
  buildScoreSheetRoute: (entry: Entry) => string;
  /** Force-refresh from the data hook. */
  refresh: (forceSync?: boolean) => Promise<void>;

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

const NOOP_LONG_PRESS: LongPressHandlers = {
  onMouseDown: () => {},
  onMouseUp: () => {},
  onMouseLeave: () => {},
  onTouchStart: () => {},
  onTouchEnd: () => {},
};

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
    refresh,
    setActiveStatusPopup,
    setActiveResetMenu,
    setResetMenuPosition,
    setResetConfirmDialog,
    setIsDragMode,
    setIsManualRefreshing,
    setActiveTab,
    setLocalEntries,
  } = deps;

  // ── Routing ──────────────────────────────────────────────────────────
  const getScoreSheetRoute = useCallback<EntryListHandlers['getScoreSheetRoute']>(
    entry => buildScoreSheetRoute(entry),
    [buildScoreSheetRoute]
  );

  // ── In-ring set (ring management) ────────────────────────────────────
  const setDogInRingStatus = useCallback<EntryListHandlers['setDogInRingStatus']>(
    async (dogId, inRing) => {
      try {
        if (inRing) {
          // Other entries must leave the ring first. `handleToggleInRing(id,
          // true)` clears them to 'no-status' (in-ring is single-occupancy);
          // calling handleMarkInRing here would re-mark them in-ring instead.
          const others = localEntries.filter(
            e => e.id !== dogId && (e.inRing || e.status === 'in-ring')
          );
          await Promise.all(others.map(e => actions.handleToggleInRing(e.id, true)));
          await actions.handleMarkInRing(dogId);
        } else {
          await actions.handleToggleInRing(dogId, true);
        }
        return true;
      } catch (error) {
        logger.error('[at-show] setDogInRingStatus failed', 'at-show', { error: String(error) });
        return false;
      }
    },
    [actions, localEntries]
  );

  // ── Entry tap ────────────────────────────────────────────────────────
  const handleEntryClick = useCallback<EntryListHandlers['handleEntryClick']>(
    entry => {
      if (entry.isScored) return;
      if (!hasPermission('canScore')) {
        alert('You do not have permission to score entries.');
        return;
      }
      // INTENT (spike): the tryApplyFixedMaxTime / MaxTimeDialog gate is
      // STUBBED. We optimistically mark in-ring and navigate; the scoresheet
      // route is wired in Phase 1h (may 404 until then).
      void actions.handleMarkInRing(entry.id, entry.status);
      navigate(buildScoreSheetRoute(entry));
    },
    [actions, hasPermission, navigate, buildScoreSheetRoute]
  );

  // INTENT (spike): no prefetch cache in myK9Show yet — pure no-op.
  const handleEntryPrefetch = useCallback<EntryListHandlers['handleEntryPrefetch']>(() => {}, []);

  // ── Status mutations (delegate) ──────────────────────────────────────
  const handleStatusChange = useCallback<EntryListHandlers['handleStatusChange']>(
    async (entryId, status: EntryStatusChange) => {
      setActiveStatusPopup(null);
      if (status === 'in-ring') {
        await actions.handleMarkInRing(entryId);
        return;
      }
      if (status === 'completed') {
        await actions.handleMarkCompleted(entryId);
        return;
      }
      await actions.handleStatusChange(entryId, status);
    },
    [actions, setActiveStatusPopup]
  );

  const handleStatusClick = useCallback<EntryListHandlers['handleStatusClick']>(
    (e: ReactMouseEvent, entryId) => {
      e.preventDefault();
      e.stopPropagation();
      setActiveStatusPopup(entryId);
    },
    [setActiveStatusPopup]
  );

  // ── Reset menu / dialog ──────────────────────────────────────────────
  const handleResetMenuClick = useCallback<EntryListHandlers['handleResetMenuClick']>(
    (e: ReactMouseEvent, entryId) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setResetMenuPosition({ top: rect.bottom + 4, left: rect.right });
      setActiveResetMenu(entryId);
    },
    [setResetMenuPosition, setActiveResetMenu]
  );

  const handleResetScore = useCallback<EntryListHandlers['handleResetScore']>(
    entry => {
      setActiveResetMenu(null);
      setResetMenuPosition(null);
      setResetConfirmDialog({ show: true, entry });
    },
    [setActiveResetMenu, setResetMenuPosition, setResetConfirmDialog]
  );

  const confirmResetScore = useCallback<EntryListHandlers['confirmResetScore']>(async () => {
    // Optimistic UI clear happens shim-side; the action itself is a spike stub.
    setActiveTab('pending');
    setResetConfirmDialog({ show: false, entry: null });
  }, [setActiveTab, setResetConfirmDialog]);

  const cancelResetScore = useCallback<EntryListHandlers['cancelResetScore']>(() => {
    setResetConfirmDialog({ show: false, entry: null });
  }, [setResetConfirmDialog]);

  const closeResetMenu = useCallback<EntryListHandlers['closeResetMenu']>(() => {
    setActiveResetMenu(null);
    setResetMenuPosition(null);
  }, [setActiveResetMenu, setResetMenuPosition]);

  // ── Run order ────────────────────────────────────────────────────────
  const handleOpenDragMode = useCallback<EntryListHandlers['handleOpenDragMode']>(() => {
    setIsDragMode(true);
  }, [setIsDragMode]);

  const handleApplyRunOrder = useCallback<EntryListHandlers['handleApplyRunOrder']>(
    async (preset: RunOrderPreset) => {
      if (preset === 'manual') {
        setIsDragMode(true);
        return;
      }
      // INTENT (spike): run-order apply/persist is STUBBED. The `run_order`
      // column exists (reads are real → Entry.exhibitorOrder), but the
      // preset-apply write path is deferred to a later /at-show PR.
      logger.warn(`[at-show] handleApplyRunOrder('${preset}') is stubbed for the spike`);
    },
    [setIsDragMode]
  );

  // ── Refresh ──────────────────────────────────────────────────────────
  const handleManualRefresh = useCallback<EntryListHandlers['handleManualRefresh']>(async () => {
    setIsManualRefreshing(true);
    try {
      await Promise.all([refresh(true), new Promise(resolve => setTimeout(resolve, 500))]);
    } finally {
      setIsManualRefreshing(false);
    }
  }, [refresh, setIsManualRefreshing]);

  const handleHardRefresh = useCallback<EntryListHandlers['handleHardRefresh']>(() => {
    window.location.reload();
  }, []);

  // ── Class-status dialog (real via replication adapter) ───────────────
  const handleStatusDialogChange = useCallback<EntryListHandlers['handleStatusDialogChange']>(
    async (status, timeValue) => {
      // ringside passes its own status string; the replication adapter maps it
      // to myK9Show's vocabulary (lossy, owner-approved) + threads start_time.
      await replication.updateClassStatus(
        deps.classId ?? '',
        status as Parameters<RingsideReplication['updateClassStatus']>[1],
        timeValue ? { start_time: timeValue } : undefined
      );
    },
    [replication, deps.classId]
  );

  // ── Spike stubs (service-coupled, deferred) ──────────────────────────
  const handleRecalculatePlacements = useCallback<
    EntryListHandlers['handleRecalculatePlacements']
  >(async () => {
    // INTENT (spike): myK9Show computes placements via client-side
    // PlacementCalculatorService, not myK9Q's recalculate_class_placements RPC.
    // Reconciling the two is out of spike scope.
    logger.warn('[at-show] handleRecalculatePlacements is stubbed for the spike');
  }, []);

  const stubPrint = useCallback((kind: string) => {
    logger.warn(`[at-show] ${kind} print is not available in the spike`);
  }, []);
  const handlePrintCheckIn = useCallback<EntryListHandlers['handlePrintCheckIn']>(
    () => stubPrint('check-in'),
    [stubPrint]
  );
  const handlePrintResults = useCallback<EntryListHandlers['handlePrintResults']>(
    () => stubPrint('results'),
    [stubPrint]
  );
  const handlePrintScoresheet = useCallback<EntryListHandlers['handlePrintScoresheet']>(
    async () => stubPrint('scoresheet'),
    [stubPrint]
  );

  const handleStatisticsClick = useCallback<EntryListHandlers['handleStatisticsClick']>(() => {
    // INTENT (spike): stats page not mounted at /at-show — signal "no stats".
    return false;
  }, []);

  // Silence unused-in-spike setter (kept in deps for parity with the shim).
  void setLocalEntries;

  return {
    getScoreSheetRoute,
    setDogInRingStatus,
    handleEntryClick,
    handleEntryPrefetch,
    handleStatusChange,
    handleStatusClick,
    handleResetMenuClick,
    handleResetScore,
    confirmResetScore,
    cancelResetScore,
    closeResetMenu,
    handleApplyRunOrder,
    handleOpenDragMode,
    handleManualRefresh,
    handleHardRefresh,
    refreshLongPressHandlers: NOOP_LONG_PRESS,
    handleRecalculatePlacements,
    handlePrintCheckIn,
    handlePrintResults,
    handlePrintScoresheet,
    handleStatusDialogChange,
    handleStatisticsClick,
  };
}

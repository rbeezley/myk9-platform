/**
 * AtShowCombinedEntryListPage — Phase 1h host shim for the COMBINED Novice
 * Section A/B entry list (AKC Scent Work Novice runs A + B together, places
 * them separately). Mounts `@myk9/ringside`'s `CombinedEntryListPage`.
 *
 * Mirrors `AtShowEntryListPage` (single class) but for the combined view:
 *  - `useEntryListData({ classIdA, classIdB })` → fetchCombinedClasses
 *  - `useEntryListFilters({ supportSectionFilter: true })` → the
 *    All / Section A / Section B tabs + counts
 *  - ringside `useEntryHandlers` → the combined `combinedHandlers` bag
 *  - custom `compareEntries` sort (adds 'section-armband')
 *
 * Run order persists offline-first through the replication layer (same RLS /
 * `ringside_update_entry` routing as the single-class AtShowEntryListPage), for
 * BOTH paths: drag-to-reorder via `persistEntryRunOrder`, and the section-aware
 * PRESET dialog via `applyCombinedRunOrder` (which respects the combined `scope`
 * A/B + `renumberMode` contract). Remaining out-of-scope service callbacks are
 * deliberate stubs: print and scoresheet prefetch are no-ops. Scoresheet
 * navigation points at the at-show scoresheet route (built in a later slice).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  RingsideProvider,
  CombinedEntryListPage,
  useEntryListData,
  useEntryListFilters,
  useDragAndDropEntries,
  useEntryHandlers,
  compareEntries,
  buildEntryListOwnership,
  type Entry,
  type EntryListDataDependencies,
  type RingsideShowContext,
  type CombinedEntryListUiState,
  type RunOrderPreset,
  type RunOrderScope,
  type RenumberMode,
} from '@myk9/ringside';

// Derive these from the page's own UI-state type — the barrel also exports
// ClassList's `SortOrder`/`PrintDialogState` under the same names, so importing
// them directly resolves to the wrong (ClassList) variants.
type SortOrder = CombinedEntryListUiState['sortOrder'];
type PrintDialogState = CombinedEntryListUiState['printDialogState'];
import { replicatedShowsTable } from '@/services/replication';
import { logger } from '@/utils/logger';
import { applyCombinedRunOrder } from './applyCombinedRunOrder';
import { notifyRunOrderPersistError } from './runOrderErrorToast';
import { persistEntryRunOrder } from './persistEntryRunOrder';
import { buildRingsideContextValue } from './ringsideCapabilities';
import { useRingsideEffectiveRole } from './useRingsideEffectiveRole';
import { createAtShowDataDependencies } from './atShowDataAdapter';
import { useAtShowEntryListActions } from './useAtShowEntryListActions';
import { atShowLayoutSlots } from './slots/atShowLayoutSlots';
import { atShowDialogSlots } from './slots/atShowDialogSlots';
import { useAtShowDogFavoritesSynced } from './dogFavoritesSync';
import { useAtShowFavoriteAlertNudge } from './useAtShowFavoriteAlertNudge';
import { AtShowAddToHomeNudge } from './AtShowAddToHomeNudge';
import { useMyAtShowEntries } from './useMyAtShowEntries';
import { useMyRingConflicts } from './useMyRingConflicts';
import { useAtShowRealtimeRefresh } from './useAtShowRealtimeRefresh';

export const AtShowCombinedEntryListPage: React.FC = () => {
  const { showId, classIdA, classIdB } = useParams<{
    showId: string;
    classIdA: string;
    classIdB: string;
  }>();
  // ── Role + permissions ────────────────────────────────────────────────
  // Account RBAC → primary ShowRole → ringside's 4-role enum, with a Phase 1c
  // show-scoped passcode grant overriding the mapping. Shared with the
  // single-class and scoresheet shims via `useRingsideEffectiveRole`.
  const { showRole, grantRole, ringsideRole, hasPermission } = useRingsideEffectiveRole(showId);
  // Device-local favorites, mirrored to `dog_favorites` when signed in so the
  // notification monitor can watch them for "your turn" push (MYK9-79).
  const { favoriteArmbands, toggleFavoriteArmband } = useAtShowDogFavoritesSynced(showId);
  const { showAddToHomeNudge, nudgeReason, installInstructions, dismissNudge } =
    useAtShowFavoriteAlertNudge(favoriteArmbands);

  // ── Show metadata + provider value ─────────────────────────────────────
  const { data: show } = useQuery({
    queryKey: ['at-show', 'show', showId],
    queryFn: () => replicatedShowsTable.getShowById(showId as string),
    enabled: !!showId,
  });
  const ringsideShowContext = useMemo<RingsideShowContext | null>(() => {
    if (!showId) return null;
    return {
      showId,
      showName: show?.name ?? '',
      clubName: '',
      showDate: show?.startDate ?? '',
      licenseKey: showId,
      org: show?.organization ?? '',
      // Drives ringside Nationals detection (isNationalsCompetition matches
      // the substring 'national'); map from the show's is_nationals flag.
      competition_type: show?.isNationals ? 'Nationals' : 'Regular',
    };
  }, [showId, show]);
  const contextValue = useMemo(
    () => buildRingsideContextValue({ showRole, showContext: ringsideShowContext, grantRole }),
    [showRole, ringsideShowContext, grantRole]
  );

  // ── Data (combined: both class ids) ────────────────────────────────────
  const isDraggingRef = useRef<boolean>(false);
  const dependencies = useMemo<EntryListDataDependencies>(
    () => ({
      auth: {
        role: ringsideRole,
        showContext: showId ? { licenseKey: showId } : null,
      },
      ...createAtShowDataDependencies(),
    }),
    [ringsideRole, showId]
  );

  const { entries, classInfo, isRefreshing, fetchError, refresh } = useEntryListData({
    ...(classIdA ? { classIdA } : {}),
    ...(classIdB ? { classIdB } : {}),
    isDraggingRef,
    dependencies,
  });

  // An exhibitor-role account (including an admin who entered an exhibitor
  // passcode) lacks the staff RLS authority the replicated writer needs, so its
  // check-in writes must route through the ownership-scoped `self_checkin_entry`
  // RPC — otherwise the optimistic update sticks locally but never syncs.
  const actions = useAtShowEntryListActions({
    refresh,
    writer: ringsideRole === 'exhibitor' ? 'self-checkin-rpc' : 'replicated',
  });

  // ── Realtime: scoring/check-in changes elsewhere re-sync this list ─────
  useAtShowRealtimeRefresh(showId, refresh);

  // ── Shim-owned state (mirrors CombinedEntryListUiState) ────────────────
  const [localEntries, setLocalEntries] = useState<Entry[]>([]);
  const [, setManualOrder] = useState<Entry[]>([]);
  const [sortOrder, setSortOrder] = useState<SortOrder>('section-armband');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [runOrderDialogOpen, setRunOrderDialogOpen] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [isDragMode, setIsDragMode] = useState(false);
  const [selfCheckinDisabledDialog, setSelfCheckinDisabledDialog] = useState(false);
  const [printDialogState, setPrintDialogState] = useState<PrintDialogState>({ type: null });

  // ── Filters (section filter ON → All / Section A / Section B tabs) ─────
  const {
    activeTab,
    setActiveTab,
    searchTerm,
    setSearchTerm,
    sectionFilter,
    setSectionFilter,
    filteredEntries,
    entryCounts,
  } = useEntryListFilters({
    entries: localEntries,
    supportManualSort: false,
    supportSectionFilter: true,
  });

  // Combined custom sort (adds 'section-armband') over the section-filtered set.
  const sortedEntries = useMemo(
    () => [...filteredEntries].sort((a, b) => compareEntries(a, b, sortOrder)),
    [filteredEntries, sortOrder]
  );
  const pendingEntries = useMemo(() => sortedEntries.filter(e => !e.isScored), [sortedEntries]);
  const completedEntries = useMemo(() => sortedEntries.filter(e => e.isScored), [sortedEntries]);
  const currentEntries = activeTab === 'pending' ? pendingEntries : completedEntries;

  // ── Combined handlers bag (ringside hook) ──────────────────────────────
  const combinedHandlers = useEntryHandlers({
    localEntries,
    setLocalEntries,
    entries,
    handleMarkInRing: actions.handleMarkInRing,
    handleMarkCompleted: actions.handleMarkCompleted,
    handleStatusChangeHook: actions.handleStatusChange,
    handleResetScoreHook: actions.handleResetScore,
    refresh,
    setActiveTab,
  });

  // ── Drag (run-order persist) ───────────────────────────────────────────
  // Same contract as the single-class AtShowEntryListPage — see
  // persistEntryRunOrder for the offline-first / RLS details.
  const updateExhibitorOrder = useCallback(
    (reordered: Entry[]) => persistEntryRunOrder(reordered),
    []
  );
  const { sensors, handleDragStart, handleDragEnd } = useDragAndDropEntries({
    localEntries,
    setLocalEntries,
    currentEntries,
    updateExhibitorOrder,
    isDraggingRef,
    setManualOrder,
  });

  // ── Effects: mirror fetched entries (drag-guarded) + initial load ──────
  useEffect(() => {
    if (isDraggingRef.current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalEntries(entries);
  }, [entries]);
  useEffect(() => {
    if (!isRefreshing && !isLoaded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoaded(true);
    }
  }, [isRefreshing, isLoaded]);

  // ── Scoresheet route (built in a later slice; may 404 until then) ──────
  const getScoresheetNavigationRoute = useCallback(
    (entry: Entry) => `/at-show/${showId}/class/${entry.classId}/score/${entry.id}`,
    [showId]
  );

  // ── Service callbacks (print/prefetch still stubbed; run-order is real) ──
  const onPrintSortOrder = useCallback(() => {
    logger.warn('[at-show] combined print is not available in the spike', 'at-show');
  }, []);
  // Apply a run-order PRESET (by-armband / random / section-scoped). Mirrors the
  // single-class preset path but section-aware: `scope` (A/B/all) + `renumberMode`
  // route through `applyCombinedRunOrder`, which persists each entry's run_order
  // offline-first via the replication layer. `manual` opens drag mode instead.
  const onApplyRunOrder = useCallback<
    (preset: RunOrderPreset, scope?: RunOrderScope, renumberMode?: RenumberMode) => Promise<void>
  >(
    async (preset, scope, renumberMode) => {
      if (preset === 'manual') {
        setIsDragMode(true);
        return;
      }
      try {
        await applyCombinedRunOrder(localEntries, preset, scope, renumberMode);
      } catch (error) {
        // Surface the failure, then re-throw: the ringside CombinedEntryListPage
        // wrapper catches it to close the dialog WITHOUT flashing the success
        // banner. Swallowing here would let that banner show on a failed write.
        notifyRunOrderPersistError(error);
        throw error;
      }
      // The write landed — re-pull is best-effort reconciliation, kept OUT of the
      // try so a refresh hiccup can't read as a failed apply (false error toast +
      // suppressed success banner). The persist outcome alone decides success.
      await refresh();
    },
    [localEntries, refresh]
  );
  const onPrefetchScoresheet = useCallback(() => {}, []);

  // ── Ownership annotations (own-dog highlight + dogs-ahead pills) ────────
  // Combined A/B run together, so the queue is computed over the merged
  // localEntries — exactly what the page renders.
  const { ownEntryIds } = useMyAtShowEntries(showId);
  const conflictLabels = useMyRingConflicts(showId, ownEntryIds);
  const ownership = useMemo(
    () => buildEntryListOwnership(localEntries, ownEntryIds, conflictLabels),
    [localEntries, ownEntryIds, conflictLabels]
  );

  // ── Context ────────────────────────────────────────────────────────────
  const canManageClasses = hasPermission('canManageClasses');
  const pageShowContext = useMemo(
    () => (showId ? { ...(show?.organization ? { org: show.organization } : {}) } : null),
    [showId, show]
  );

  return (
    <RingsideProvider value={contextValue}>
      <div className="ringside-root">
        {showAddToHomeNudge && (
          <AtShowAddToHomeNudge
            reason={nudgeReason}
            installInstructions={installInstructions}
            onDismiss={dismissNudge}
          />
        )}
        <CombinedEntryListPage
          classIds={{ a: classIdA, b: classIdB }}
          data={{ entries, classInfo }}
          dataStatus={{ isRefreshing, fetchError, refresh }}
          actions={actions}
          combinedHandlers={combinedHandlers}
          uiState={{
            localEntries,
            sortOrder,
            isLoaded,
            isFilterPanelOpen,
            runOrderDialogOpen,
            showSuccessMessage,
            isDragMode,
            selfCheckinDisabledDialog,
            printDialogState,
          }}
          uiActions={{
            setLocalEntries,
            setManualOrder,
            setSortOrder,
            setIsLoaded,
            setIsFilterPanelOpen,
            setRunOrderDialogOpen,
            setShowSuccessMessage,
            setIsDragMode,
            setSelfCheckinDisabledDialog,
            setPrintDialogState,
            setActiveTab,
            setSearchTerm,
            setSectionFilter,
          }}
          derived={{
            activeTab,
            searchTerm,
            sectionFilter,
            filteredEntries,
            sortedEntries,
            pendingEntries,
            completedEntries,
            currentEntries,
            entryCounts,
          }}
          favorites={{ favoriteArmbands, onToggleFavoriteArmband: toggleFavoriteArmband }}
          {...(ownership ? { ownership } : {})}
          drag={{ sensors, handleDragStart, handleDragEnd, isDraggingRef }}
          dialogs={{
            CheckinStatusDialog: atShowDialogSlots.CheckinStatusDialog,
            RunOrderDialog: atShowDialogSlots.RunOrderDialog,
            ScoresheetPrintDialog: atShowDialogSlots.ScoresheetPrintDialog,
          }}
          layout={atShowLayoutSlots}
          context={{
            role: ringsideRole,
            showContext: pageShowContext,
            hasPermission,
            hideMaxTimeOption: !canManageClasses,
            hideSettingsOption: !canManageClasses,
            // No printing at ringside — reports live on the secretary Reports page.
            hidePrintOptions: true,
          }}
          onPrintSortOrder={onPrintSortOrder}
          onApplyRunOrder={onApplyRunOrder}
          getScoresheetNavigationRoute={getScoresheetNavigationRoute}
          onPrefetchScoresheet={onPrefetchScoresheet}
        />
      </div>
    </RingsideProvider>
  );
};

export default AtShowCombinedEntryListPage;

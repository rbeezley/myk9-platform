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
 * Out-of-scope service callbacks are deliberate stubs (owner: at-show only
 * READS run order; the Trial Secretary sets it elsewhere): print, run-order
 * apply, and scoresheet prefetch are no-ops. Scoresheet navigation points at
 * the at-show scoresheet route (built in a later slice).
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
} from '@myk9/ringside';

// Derive these from the page's own UI-state type — the barrel also exports
// ClassList's `SortOrder`/`PrintDialogState` under the same names, so importing
// them directly resolves to the wrong (ClassList) variants.
type SortOrder = CombinedEntryListUiState['sortOrder'];
type PrintDialogState = CombinedEntryListUiState['printDialogState'];
import { replicatedShowsTable } from '@/services/replication';
import { logger } from '@/utils/logger';
import { buildRingsideContextValue } from './ringsideCapabilities';
import { useRingsideEffectiveRole } from './useRingsideEffectiveRole';
import { createAtShowDataDependencies } from './atShowDataAdapter';
import { useAtShowEntryListActions } from './useAtShowEntryListActions';
import { atShowLayoutSlots } from './slots/atShowLayoutSlots';
import { atShowDialogSlots } from './slots/atShowDialogSlots';
import { useAtShowDogFavorites } from './ringsideDogFavorites';
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
  const { favoriteArmbands, toggleFavoriteArmband } = useAtShowDogFavorites(showId);

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
      competition_type: '',
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

  const actions = useAtShowEntryListActions({ refresh });

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

  // ── Drag (run-order persist stubbed — out of scope at-show) ────────────
  const updateExhibitorOrder = useCallback(async (): Promise<unknown> => {
    logger.warn('[at-show] combined drag run-order persist is stubbed for the spike', 'at-show');
    return undefined;
  }, []);
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

  // ── Out-of-scope service callbacks (stubs) ─────────────────────────────
  const onPrintSortOrder = useCallback(() => {
    logger.warn('[at-show] combined print is not available in the spike', 'at-show');
  }, []);
  const onApplyRunOrder = useCallback(async () => {
    logger.warn('[at-show] combined run-order apply is stubbed for the spike', 'at-show');
  }, []);
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

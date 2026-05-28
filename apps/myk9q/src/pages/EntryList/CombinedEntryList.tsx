/**
 * CombinedEntryList host shim.
 *
 * The combined-view page moved into `@myk9/ringside` as
 * `CombinedEntryListPage` in PR E2d-2b. This shim is now the
 * host-coupled layer:
 *  - Reads useParams (for classIdA/classIdB), useAuth, usePermission
 *  - Owns 10 useState slots (mirrors `CombinedEntryListUiState`)
 *  - Calls `useEntryListData`, `useEntryListActions`, `useEntryHandlers`
 *    (ringside), `useEntryListFilters`, `useDragAndDropEntries`
 *  - Computes combined-view derived data (`sortedEntries`, splits,
 *    `currentEntries`) via ringside's `compareEntries`
 *  - Binds service-coupled callbacks for ringside: `onPrintSortOrder`,
 *    `onApplyRunOrder`, `getScoresheetNavigationRoute`,
 *    `onPrefetchScoresheet`
 *  - Assembles dialog subset + layout slots
 *  - Renders `<CombinedEntryListPage {...all-the-bags} />`
 *
 * Combined view does NOT call `useEntryListEffects` (no max-time or
 * area-count auto-open behavior in combined mode).
 */

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  CombinedEntryListPage,
  useEntryHandlers,
  compareEntries,
  getScoresheetNavigationRoute as ringsideGetScoresheetNavigationRoute,
} from '@myk9/ringside';
// App-local hook shims that inject DI deps into the underlying
// ringside hooks (useEntryListData) / wrap with extra app concerns
// (useDragAndDropEntries).
import {
  useEntryListData,
  useEntryListActions,
  useEntryListFilters,
  useDragAndDropEntries,
} from './hooks';
import type { Entry } from '../../stores/entryStore';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { usePrefetch } from '@/hooks/usePrefetch';
import { applyRunOrderPresetScoped } from '../../services/runOrderService';
import { getScoresheetRoute } from '../../services/scoresheetRouter';
import { preloadScoresheetByType } from '../../utils/scoresheetPreloader';
import { dispatchPrintAction } from './CombinedEntryList.print';
import type { SortOrder, PrintDialogState } from './CombinedEntryList.types';

// Dialog slot implementations (4 dialogs for the combined view).
import { CheckinStatusDialog } from '../../components/dialogs/CheckinStatusDialog';
import { RunOrderDialog } from '../../components/dialogs/RunOrderDialog';
import { ScoresheetPrintDialog } from '../../components/dialogs/ScoresheetPrintDialog';

// Layout slot implementations (full 10-primitive set — combined view
// uses the same layout as single-class).
import {
  HamburgerMenu,
  CompactOfflineIndicator,
  SyncIndicator,
  RefreshIndicator,
  FilterTriggerButton,
  ErrorState,
  PullToRefresh,
  FilterPanel,
} from '../../components/ui';
import { DogCard } from '../../components/DogCard';
import { ClassDetailsPopover } from '../../components/dialogs/ClassDetailsPopover';

// Re-export types for external consumers (the original
// CombinedEntryList.tsx had these re-exports — preserving for compat).
export type { SortOrder, PrintDialogState, ResetConfirmState } from './CombinedEntryList.types';

export const CombinedEntryList: React.FC = () => {
  const { classIdA, classIdB } = useParams<{ classIdA: string; classIdB: string }>();
  const { showContext, role } = useAuth();
  const { hasPermission, hasRole } = usePermission();
  const { prefetch } = usePrefetch();

  const isDraggingRef = useRef<boolean>(false);

  // Data + actions
  const { entries, classInfo, isRefreshing, fetchError, refresh } = useEntryListData({
    classIdA,
    classIdB,
  });
  const actions = useEntryListActions(refresh);

  // 10 useState slots — mirrors CombinedEntryListUiState exactly.
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

  // Pure ringside filter hook (Path A — shim-side so combinedHandlers
  // can be built with consistent setters).
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

  // Combined-view custom sort using ringside's compareEntries.
  // useEntryListFilters already section-filters; we re-sort here
  // because the hook's default sort doesn't know about
  // 'section-armband'.
  const sortedEntries = useMemo(
    () => [...filteredEntries].sort((a, b) => compareEntries(a, b, sortOrder)),
    [filteredEntries, sortOrder]
  );

  const pendingEntries = useMemo(() => sortedEntries.filter(e => !e.isScored), [sortedEntries]);
  const completedEntries = useMemo(() => sortedEntries.filter(e => e.isScored), [sortedEntries]);
  const currentEntries = activeTab === 'pending' ? pendingEntries : completedEntries;

  // Combined-handlers bag from ringside's pure hook.
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

  // Drag (pure ringside hook).
  const { sensors, handleDragStart, handleDragEnd } = useDragAndDropEntries({
    localEntries,
    setLocalEntries,
    currentEntries,
    isDraggingRef,
    setManualOrder,
  });

  // Sync local entries with fetched data (skip while dragging).
  useEffect(() => {
    if (entries.length > 0 && !isDraggingRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: syncing external data to local state
      setLocalEntries(entries);
    }
  }, [entries]);

  // Initial load animation.
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // ── Service-coupled callbacks for ringside ───────────────────────

  const onPrintSortOrder = useCallback(
    (
      type: 'check-in' | 'results-a' | 'results-b' | 'scoresheet-a' | 'scoresheet-b' | null,
      sortOrderArg: 'run-order' | 'armband' | 'placement'
    ) => {
      dispatchPrintAction(type, sortOrderArg, classInfo, showContext?.org || '', entries);
    },
    [classInfo, showContext?.org, entries]
  );

  const onApplyRunOrder = useCallback(
    async (
      preset: Parameters<typeof applyRunOrderPresetScoped>[1],
      scope?: Parameters<typeof applyRunOrderPresetScoped>[2],
      renumberMode?: Parameters<typeof applyRunOrderPresetScoped>[3]
    ) => {
      const reordered = await applyRunOrderPresetScoped(
        localEntries,
        preset,
        scope || 'all',
        renumberMode || 'renumber'
      );
      setLocalEntries(reordered);
      await refresh();
    },
    [localEntries, refresh]
  );

  const getScoresheetNavigationRoute = useCallback(
    (entry: Entry) => ringsideGetScoresheetNavigationRoute(showContext?.org || '', entry),
    [showContext?.org]
  );

  const onPrefetchScoresheet = useCallback(
    (entry: Entry) => {
      if (entry.isScored || !showContext?.org) return;
      const route = getScoresheetRoute({
        org: showContext.org,
        element: entry.element || '',
        level: entry.level || '',
        classId: entry.classId,
        entryId: entry.id,
        competition_type: showContext.competition_type || 'Regular',
      });
      preloadScoresheetByType(showContext.org, entry.element || '');
      prefetch(`scoresheet-${entry.id}`, async () => ({ entryId: entry.id, route, entry }), {
        ttl: 30,
        priority: 3,
      });
    },
    [showContext, prefetch]
  );

  // Precompute org/role booleans (combined view doesn't use these
  // directly — page contract still requires them for type alignment).
  const canModifyClassSettings = hasRole(['admin', 'judge']);
  const hideMaxTimeOption = !canModifyClassSettings;
  const hideSettingsOption = !canModifyClassSettings;

  return (
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
      drag={{ sensors, handleDragStart, handleDragEnd, isDraggingRef }}
      dialogs={{
        CheckinStatusDialog,
        RunOrderDialog,
        ScoresheetPrintDialog,
      }}
      layout={{
        HamburgerMenu,
        CompactOfflineIndicator,
        SyncIndicator,
        RefreshIndicator,
        FilterTriggerButton,
        FilterPanel,
        DogCard,
        PullToRefresh,
        ErrorState,
        ClassDetailsPopover,
      }}
      context={{
        role,
        showContext,
        hasPermission,
        hideMaxTimeOption,
        hideSettingsOption,
      }}
      onPrintSortOrder={onPrintSortOrder}
      onApplyRunOrder={onApplyRunOrder}
      getScoresheetNavigationRoute={getScoresheetNavigationRoute}
      onPrefetchScoresheet={onPrefetchScoresheet}
    />
  );
};

export default CombinedEntryList;

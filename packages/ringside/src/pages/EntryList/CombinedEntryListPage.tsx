/**
 * CombinedEntryListPage — combined A/B class entry list, ringside-side.
 *
 * Moved into @myk9/ringside in PR E2d-2b. Pure controlled render of
 * `CombinedEntryListPageProps`. Same architecture as `EntryListPage`:
 * the shim owns useState + host-coupled hooks + filter/drag hook
 * calls, the page renders from props.
 *
 * Combined-view specifics:
 *  - Uses `combinedHandlers` (smaller bag from host's `useEntryHandlers`
 *    — already in ringside as `combinedEntryListHelpers`) instead of
 *    `EntryListHandlers`.
 *  - No `useEntryListEffects` call (combined view doesn't need
 *    max-time / area-count auto-open).
 *  - Uses shim-bound `onPrintSortOrder` / `onApplyRunOrder` /
 *    `getScoresheetNavigationRoute` / `onPrefetchScoresheet` for
 *    service-coupled work the page can't do directly.
 */

import React, { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusIcon, TabBar, type Tab } from '@myk9/ui';
import { ArrowUpDown, Trophy } from 'lucide-react';
import type { Entry } from '../../stores/entryStore';
import type { CombinedEntryListPageProps, FilterPanelSortOption } from './pageProps';
import type { SortOrder } from './types';
import type { PrintSortOrder } from './dialogSlots';
import { EntryListHeader, EntryListContent } from './components';
import { CombinedEntryListDialogs } from './CombinedEntryListDialogs';
import { useAutoDismiss } from './hooks/useAutoDismiss';

function CombinedEntryListSkeleton() {
  return (
    <div role="status" aria-label="Loading combined entries" className="space-y-4 p-3">
      <div className="rounded-xl border bg-card p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-5 w-44 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-28 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-10 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="h-10 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-12 animate-pulse rounded-lg bg-muted" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded-md bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded-md bg-muted" />
              </div>
              <div className="h-7 w-16 animate-pulse rounded-full bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const CombinedEntryListPage: React.FC<CombinedEntryListPageProps> = ({
  classIds,
  data,
  dataStatus,
  actions,
  combinedHandlers,
  uiState,
  uiActions,
  derived,
  favorites,
  ownership,
  drag,
  dialogs,
  layout,
  context,
  onPrintSortOrder,
  onApplyRunOrder,
  getScoresheetNavigationRoute,
  onPrefetchScoresheet,
}) => {
  const navigate = useNavigate();
  const { entries, classInfo } = data;
  const { isRefreshing, fetchError, refresh } = dataStatus;
  const { showContext, hasPermission, role } = context;
  const { isSyncing, hasError } = actions;
  const {
    localEntries,
    sortOrder,
    isLoaded,
    isFilterPanelOpen,
    runOrderDialogOpen,
    showSuccessMessage,
    isDragMode,
    selfCheckinDisabledDialog,
    printDialogState,
  } = uiState;
  const {
    setManualOrder,
    setSortOrder,
    setIsFilterPanelOpen,
    setRunOrderDialogOpen,
    setShowSuccessMessage,
    setIsDragMode,
    setSelfCheckinDisabledDialog,
    setPrintDialogState,
    setActiveTab,
    setSearchTerm,
    setSectionFilter,
  } = uiActions;
  const {
    activeTab,
    searchTerm,
    sectionFilter,
    filteredEntries,
    pendingEntries,
    completedEntries,
    currentEntries,
    entryCounts,
  } = derived;
  const { sensors, handleDragStart, handleDragEnd } = drag;

  // Success toast with a correctly-managed auto-dismiss (clears on unmount,
  // resets on rapid consecutive saves) — replaces a fire-and-forget setTimeout.
  const showSuccess = useAutoDismiss(setShowSuccessMessage, 2000);

  // Score click — combined view navigates with paired classId in
  // state so the scoresheet knows about the other class.
  const handleScoreClick = useCallback(
    (entry: Entry) => {
      if (entry.isScored) return;

      if (!hasPermission('canScore')) {
        alert('You do not have permission to score entries.');
        return;
      }

      const pairedClassId = entry.classId === classIds.a ? classIds.b : classIds.a;

      const route = getScoresheetNavigationRoute(entry);
      if (route) {
        navigate(route, { state: { pairedClassId } });
      }
    },
    [hasPermission, classIds.a, classIds.b, getScoresheetNavigationRoute, navigate]
  );

  // Prefetch — call the shim's per-entry prefetch for the focused
  // entry and the next 2 entries in pending order.
  const handleEntryPrefetch = useCallback(
    (entry: Entry) => {
      if (entry.isScored) return;

      onPrefetchScoresheet(entry);

      const currentIndex = pendingEntries.findIndex(e => e.id === entry.id);
      if (currentIndex !== -1) {
        const nextEntries = pendingEntries.slice(currentIndex + 1, currentIndex + 3);
        nextEntries.forEach(nextEntry => {
          onPrefetchScoresheet(nextEntry);
        });
      }
    },
    [onPrefetchScoresheet, pendingEntries]
  );

  // Apply run-order preset — combined view does optimistic local
  // update + dialog close + success toast + sort reset, then awaits
  // refresh. The service-bound primitive (`onApplyRunOrder`)
  // returns the reordered entries; we apply them locally before the
  // refresh round-trip completes.
  const handleApplyRunOrder = useCallback(
    async (
      preset: import('./dialogSlots').RunOrderPreset,
      scope?: import('./dialogSlots').RunOrderScope,
      renumberMode?: import('./dialogSlots').RenumberMode
    ) => {
      try {
        await onApplyRunOrder(preset, scope, renumberMode);
        setRunOrderDialogOpen(false);
        showSuccess();
        setSortOrder('run');
      } catch {
        setRunOrderDialogOpen(false);
      }
    },
    [onApplyRunOrder, setRunOrderDialogOpen, showSuccess, setSortOrder]
  );

  // Open drag mode — closes the run-order dialog, snapshots the
  // current visible order as the starting manual order, switches to
  // drag mode + run-sort.
  const handleOpenDragMode = useCallback(() => {
    setRunOrderDialogOpen(false);
    setManualOrder([...currentEntries]);
    setIsDragMode(true);
    setSortOrder('run');
  }, [currentEntries, setRunOrderDialogOpen, setManualOrder, setIsDragMode, setSortOrder]);

  // Print sort order — page-local thin wrapper over the shim-bound
  // dispatcher. Reads which print type is queued in printDialogState,
  // clears it, then dispatches with the user's chosen sort order.
  const handlePrintSortOrder = useCallback(
    (selectedSortOrder: PrintSortOrder) => {
      const type = printDialogState.type;
      setPrintDialogState({ type: null });
      onPrintSortOrder(type, selectedSortOrder);
    },
    [printDialogState.type, setPrintDialogState, onPrintSortOrder]
  );

  // Section filter tabs
  const sectionTabs: Tab[] = useMemo(
    () => [
      { id: 'all', label: 'All Sections', count: entries.length },
      { id: 'A', label: 'Section A', count: entries.filter(e => e.section === 'A').length },
      { id: 'B', label: 'Section B', count: entries.filter(e => e.section === 'B').length },
    ],
    [entries]
  );

  // Status tabs
  const statusTabs: Tab[] = useMemo(
    () => [
      {
        id: 'pending',
        label: 'Pending',
        icon: <StatusIcon family="entry" status="pending" size="sm" decorative />,
        count: entryCounts.pending,
      },
      {
        id: 'completed',
        label: 'Completed',
        icon: <StatusIcon family="entry" status="completed" size="sm" decorative />,
        count: entryCounts.completed,
      },
    ],
    [entryCounts]
  );

  const sortOptions: FilterPanelSortOption[] = useMemo(() => {
    const options: FilterPanelSortOption[] = [
      { value: 'section-armband', label: 'Section & Armband', icon: <ArrowUpDown size={16} /> },
      { value: 'run', label: 'Run Order', icon: <ArrowUpDown size={16} /> },
      { value: 'armband', label: 'Armband', icon: <ArrowUpDown size={16} /> },
    ];
    if (activeTab === 'completed') {
      options.push({ value: 'placement', label: 'Placement', icon: <Trophy size={16} /> });
    }
    return options;
  }, [activeTab]);

  const hasActiveFilters = searchTerm.length > 0 || sortOrder !== 'section-armband';

  // Loading state
  if (!entries.length && !fetchError) {
    return <CombinedEntryListSkeleton />;
  }

  // Error state
  if (fetchError) {
    return (
      <div className="p-3">
        <layout.ErrorState
          message={`Failed to load entries: ${fetchError.message || 'Please check your connection and try again.'}`}
          onRetry={refresh}
          isRetrying={isRefreshing}
        />
      </div>
    );
  }

  return (
    <div className={`p-3${isLoaded ? ' loaded' : ''}`} data-loaded={isLoaded}>
      <EntryListHeader
        classInfo={classInfo}
        isRefreshing={isRefreshing}
        isSyncing={isSyncing}
        hasError={hasError}
        pendingCount={actions.pendingCount}
        hasActiveFilters={hasActiveFilters}
        onFilterClick={() => setIsFilterPanelOpen(true)}
        onRefresh={() => refresh(true)}
        showSectionsBadge={true}
        actionsMenu={{
          showRunOrder: hasPermission('canChangeRunOrder'),
          showPrintOptions: Boolean(role && role !== 'exhibitor') && !context.hidePrintOptions,
          onRunOrderClick: () => setRunOrderDialogOpen(true),
          printOptions: [
            {
              label: 'Check-In Sheet (A & B)',
              onClick: () => setPrintDialogState({ type: 'check-in' }),
              icon: 'checkin',
            },
            {
              label: 'Results - Section A',
              onClick: () => setPrintDialogState({ type: 'results-a' }),
              icon: 'results',
              disabled: completedEntries.filter(e => e.section === 'A').length === 0,
            },
            {
              label: 'Results - Section B',
              onClick: () => setPrintDialogState({ type: 'results-b' }),
              icon: 'results',
              disabled: completedEntries.filter(e => e.section === 'B').length === 0,
            },
            {
              label: 'Scoresheet - Section A',
              onClick: () => setPrintDialogState({ type: 'scoresheet-a' }),
              icon: 'scoresheet',
            },
            {
              label: 'Scoresheet - Section B',
              onClick: () => setPrintDialogState({ type: 'scoresheet-b' }),
              icon: 'scoresheet',
            },
          ],
        }}
        HamburgerMenu={layout.HamburgerMenu}
        CompactOfflineIndicator={layout.CompactOfflineIndicator}
        SyncIndicator={layout.SyncIndicator}
        RefreshIndicator={layout.RefreshIndicator}
        FilterTriggerButton={layout.FilterTriggerButton}
        ClassDetailsPopover={layout.ClassDetailsPopover}
      />

      {/* Section Filter Tabs */}
      <TabBar
        tabs={sectionTabs}
        activeTab={sectionFilter}
        onTabChange={tabId => setSectionFilter(tabId as 'all' | 'A' | 'B')}
        className="full-width"
      />

      {/* Status Tabs */}
      <TabBar
        tabs={statusTabs}
        activeTab={activeTab}
        onTabChange={tabId => setActiveTab(tabId as 'pending' | 'completed')}
      />

      <div className="isolate">
        <div className="pb-8 pt-2">
          <EntryListContent
            entries={currentEntries}
            activeTab={activeTab}
            isDragMode={isDragMode}
            showContext={showContext}
            classInfo={classInfo}
            hasPermission={hasPermission}
            onEntryClick={handleScoreClick}
            onStatusClick={combinedHandlers.handleStatusClick}
            onResetMenuClick={combinedHandlers.handleResetMenuClick}
            onSelfCheckinDisabled={() => setSelfCheckinDisabledDialog(true)}
            onPrefetch={handleEntryPrefetch}
            showSectionBadges={true}
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onOpenDragMode={handleOpenDragMode}
            {...(favorites ? { favorites } : {})}
            {...(ownership ? { ownership } : {})}
            DogCard={layout.DogCard}
          />
        </div>
      </div>

      <CombinedEntryListDialogs
        isFilterPanelOpen={isFilterPanelOpen}
        onFilterClose={() => setIsFilterPanelOpen(false)}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        sortOptions={sortOptions}
        sortOrder={sortOrder}
        onSortChange={(order: SortOrder) => {
          setSortOrder(order);
          setIsDragMode(false);
        }}
        resultsLabel={
          searchTerm
            ? `${filteredEntries.length} of ${localEntries.length} entries`
            : `${currentEntries.length} entries`
        }
        activeStatusPopup={combinedHandlers.activeStatusPopup}
        onStatusPopupClose={() => combinedHandlers.setActiveStatusPopup(null)}
        onStatusChange={combinedHandlers.handleStatusChange}
        localEntries={localEntries}
        hasCanScorePermission={hasPermission('canScore')}
        runOrderDialogOpen={runOrderDialogOpen}
        onRunOrderClose={() => setRunOrderDialogOpen(false)}
        onApplyRunOrder={handleApplyRunOrder}
        onOpenDragMode={handleOpenDragMode}
        activeResetMenu={combinedHandlers.activeResetMenu}
        resetMenuPosition={combinedHandlers.resetMenuPosition}
        onResetScore={combinedHandlers.handleResetScore}
        onResetMenuClose={combinedHandlers.closeResetMenu}
        resetConfirmDialog={combinedHandlers.resetConfirmDialog}
        onConfirmReset={combinedHandlers.confirmResetScore}
        onCancelReset={combinedHandlers.cancelResetScore}
        selfCheckinDisabledDialog={selfCheckinDisabledDialog}
        onSelfCheckinDisabledClose={() => setSelfCheckinDisabledDialog(false)}
        printDialogState={printDialogState}
        onPrintDialogClose={() => setPrintDialogState({ type: null })}
        onPrintSortOrder={handlePrintSortOrder}
        showSuccessMessage={showSuccessMessage}
        isDragMode={isDragMode}
        onDoneClick={() => {
          setIsDragMode(false);
          setSortOrder('run');
        }}
        CheckinStatusDialog={dialogs.CheckinStatusDialog}
        RunOrderDialog={dialogs.RunOrderDialog}
        ScoresheetPrintDialog={dialogs.ScoresheetPrintDialog}
        FilterPanel={layout.FilterPanel}
      />
    </div>
  );
};

export default CombinedEntryListPage;

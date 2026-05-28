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
import { TabBar, type Tab } from '@myk9/ui';
import { Clock, CheckCircle, ArrowUpDown, Trophy, RefreshCw } from 'lucide-react';
import type { Entry } from '../../stores/entryStore';
import type { CombinedEntryListPageProps, FilterPanelSortOption } from './pageProps';
import type { SortOrder } from './types';
import type { PrintSortOrder } from './dialogSlots';
import { EntryListHeader, EntryListContent } from './components';
import { CombinedEntryListDialogs } from './CombinedEntryListDialogs';

export const CombinedEntryListPage: React.FC<CombinedEntryListPageProps> = ({
  classIds,
  data,
  dataStatus,
  actions,
  combinedHandlers,
  uiState,
  uiActions,
  derived,
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
  const { showContext, hasPermission } = context;
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

  // Score click — combined view navigates with paired classId in
  // state so the scoresheet knows about the other class.
  const handleScoreClick = useCallback(
    (entry: Entry) => {
      if (entry.isScored) return;

      if (!hasPermission('canScore')) {
        alert('You do not have permission to score entries.');
        return;
      }

      const pairedClassId =
        entry.classId === parseInt(classIds.a!) ? parseInt(classIds.b!) : parseInt(classIds.a!);

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
      renumberMode?: import('./dialogSlots').RenumberMode,
    ) => {
      try {
        await onApplyRunOrder(preset, scope, renumberMode);
        setRunOrderDialogOpen(false);
        setShowSuccessMessage(true);
        setSortOrder('run');
        setTimeout(() => setShowSuccessMessage(false), 2000);
      } catch {
        setRunOrderDialogOpen(false);
      }
    },
    [onApplyRunOrder, setRunOrderDialogOpen, setShowSuccessMessage, setSortOrder]
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
      { id: 'pending', label: 'Pending', icon: <Clock size={16} />, count: entryCounts.pending },
      {
        id: 'completed',
        label: 'Completed',
        icon: <CheckCircle size={16} />,
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
    return (
      <div className="entry-list-container">
        <div className="flex items-center justify-center" style={{ minHeight: '50vh' }}>
          <div className="text-center">
            <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin mx-auto mb-2" />
            <p className="text-muted-foreground">Loading combined entries...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (fetchError) {
    return (
      <div className="entry-list-container">
        <layout.ErrorState
          message={`Failed to load entries: ${fetchError.message || 'Please check your connection and try again.'}`}
          onRetry={refresh}
          isRetrying={isRefreshing}
        />
      </div>
    );
  }

  return (
    <div className={`entry-list-container${isLoaded ? ' loaded' : ''}`} data-loaded={isLoaded}>
      <EntryListHeader
        classInfo={classInfo}
        isRefreshing={isRefreshing}
        isSyncing={isSyncing}
        hasError={hasError}
        hasActiveFilters={hasActiveFilters}
        onFilterClick={() => setIsFilterPanelOpen(true)}
        onRefresh={() => refresh(true)}
        showSectionsBadge={true}
        actionsMenu={{
          showRunOrder: hasPermission('canChangeRunOrder'),
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

      <div className="entry-list-scrollable">
        <div className="entry-list-content">
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

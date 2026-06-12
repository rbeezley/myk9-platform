/**
 * EntryListPage — single-class entry list, ringside-side.
 *
 * Moved into @myk9/ringside in PR E2d-2b. This component is a pure
 * controlled render of `EntryListPageProps` — it owns NO useState,
 * NO useRef, NO useEffect of its own (beyond trivial useMemo for
 * render derivations), and calls NO host-coupled hooks.
 *
 * The shim at `apps/myk9q/src/pages/EntryList/EntryList.tsx` owns:
 *  - auth, permission, routing
 *  - all 19 useState slots
 *  - `useEntryListData`, `useEntryListActions`, `useEntryListHandlers`,
 *    `useEntryListEffects` (all host-coupled hooks)
 *  - `useEntryListFilters`, `useDragAndDropEntries` (pure ringside
 *    hooks — called shim-side so the resulting filter setters are
 *    available to `useEntryListHandlers` as deps; see Path A
 *    architecture note in `pageProps.ts`)
 *  - all 10 dialog implementations + 10 UI primitives as slot bags
 *
 * The shim renders `<EntryListPage {...all-the-bags} />` and that's it.
 */

import React, { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabBar, type Tab } from '@myk9/ui';
import { Clock, CheckCircle, Trophy, ArrowUpDown, Users, ArrowLeft } from 'lucide-react';
import type { EntryListPageProps, FilterPanelSortOption } from './pageProps';
import type { PrintSortOrder } from './dialogSlots';
import type { TabType } from './hooks/useEntryListFilters';
import {
  EntryListHeader,
  EntryListContent,
  EntryListDialogs,
  SuccessToast,
  FloatingDoneButton,
} from './components';

export const EntryListPage: React.FC<EntryListPageProps> = ({
  classId,
  data,
  dataStatus,
  handlers,
  actions,
  uiState,
  uiActions,
  derived,
  favorites,
  ownership,
  drag,
  dialogs,
  layout,
  context,
}) => {
  const navigate = useNavigate();
  const { entries, classInfo } = data;
  const { isRefreshing, fetchError, refresh } = dataStatus;
  const { showContext, hasPermission } = context;
  const {
    localEntries,
    activeStatusPopup,
    isManualRefreshing,
    isLoaded,
    hasCompletedInitialLoad,
    isDragMode,
    runOrderDialogOpen,
    classOptionsDialogOpen,
    requirementsDialogOpen,
    maxTimeDialogOpen,
    maxTimeRequiredWarning,
    settingsDialogOpen,
    noStatsDialogOpen,
    statusDialogOpen,
    selfCheckinDisabledDialog,
    showSuccessMessage,
    isFilterPanelOpen,
    isRecalculatingPlacements,
    printDialogType,
    activeResetMenu,
    resetMenuPosition,
    resetConfirmDialog,
    areaCountDialogOpen,
    areaCountRequirements,
  } = uiState;
  const {
    setActiveStatusPopup,
    setRunOrderDialogOpen,
    setClassOptionsDialogOpen,
    setRequirementsDialogOpen,
    setMaxTimeDialogOpen,
    setSettingsDialogOpen,
    setStatusDialogOpen,
    setNoStatsDialogOpen,
    setSelfCheckinDisabledDialog,
    setMaxTimeRequiredWarning,
    setAreaCountDialogOpen,
    setIsFilterPanelOpen,
    setIsDragMode,
    setPrintDialogType,
    setActiveTab,
    setSortOrder,
  } = uiActions;
  const {
    activeTab,
    sortOrder,
    searchTerm,
    filteredEntries,
    completedEntries,
    currentEntries,
    entryCounts,
  } = derived;
  const { sensors, handleDragStart, handleDragEnd } = drag;
  const { isSyncing, hasError } = actions;

  // Handler for when user picks a sort order from the print dialog
  const handlePrintSortOrder = useCallback(
    (selectedSortOrder: PrintSortOrder) => {
      const type = printDialogType;
      setPrintDialogType(null);
      if (type === 'check-in') handlers.handlePrintCheckIn({ sortOrder: selectedSortOrder });
      else if (type === 'results')
        handlers.handlePrintResults({
          sortOrder: selectedSortOrder === 'run-order' ? 'placement' : 'armband',
        });
      else if (type === 'scoresheet')
        handlers.handlePrintScoresheet({ sortOrder: selectedSortOrder });
    },
    [printDialogType, handlers, setPrintDialogType]
  );

  // Tab configuration.
  // NOTE: Use entryCounts (from full entries array) instead of
  // pendingEntries.length/completedEntries.length because those are
  // derived from filteredEntries which is already tab-filtered,
  // causing inactive tab to show 0.
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
    [entryCounts.pending, entryCounts.completed]
  );

  // Sort options
  const sortOptions: FilterPanelSortOption[] = useMemo(() => {
    const options: FilterPanelSortOption[] = [
      { value: 'run', label: 'Run Order', icon: <ArrowUpDown size={16} /> },
      { value: 'armband', label: 'Armband', icon: <ArrowUpDown size={16} /> },
    ];
    if (activeTab === 'completed') {
      options.push({ value: 'placement', label: 'Placement', icon: <Trophy size={16} /> });
    }
    return options;
  }, [activeTab]);

  const hasActiveFilters = searchTerm.length > 0 || sortOrder !== 'run';

  // Loading state - show spinner while we haven't completed initial load
  if (!hasCompletedInitialLoad && !fetchError) {
    return (
      <div className="p-3">
        <div className="flex flex-col items-center justify-center gap-2 px-3 py-8 text-center text-muted-foreground">
          Loading entries...
        </div>
      </div>
    );
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

  // Empty state - class exists but has no entries
  if (hasCompletedInitialLoad && entries.length === 0) {
    return (
      <div className="p-3">
        <div className="flex flex-col items-center justify-center gap-2 px-3 py-8 text-center text-muted-foreground">
          <div className="empty-state-icon">
            <Users size={48} />
          </div>
          <h2 className="m-0 text-lg font-semibold text-foreground">No Entries Yet</h2>
          {classInfo?.className && <p className="empty-state-class-name">{classInfo.className}</p>}
          <p className="empty-state-message">
            This class doesn't have any entries yet. Entries will appear once they are registered.
          </p>
          <div className="empty-state-action">
            <button className="btn btn-secondary" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} />
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-3${isLoaded ? ' loaded' : ''}`} data-loaded={isLoaded}>
      <EntryListHeader
        classInfo={classInfo}
        isRefreshing={isRefreshing || isManualRefreshing}
        isSyncing={isSyncing}
        hasError={hasError}
        hasActiveFilters={hasActiveFilters}
        onFilterClick={() => setIsFilterPanelOpen(true)}
        onRefresh={handlers.handleManualRefresh}
        refreshLongPressHandlers={handlers.refreshLongPressHandlers}
        actionsMenu={{
          showRunOrder: hasPermission('canChangeRunOrder'),
          showRecalculatePlacements: hasPermission('canManageClasses'),
          showClassSettings: hasPermission('canManageClasses'),
          isRecalculatingPlacements,
          onRunOrderClick: () => setRunOrderDialogOpen(true),
          onRecalculatePlacements: handlers.handleRecalculatePlacements,
          onClassSettingsClick: () => setClassOptionsDialogOpen(true),
          printOptions: [
            {
              label: 'Check-In Sheet',
              onClick: () => setPrintDialogType('check-in'),
              icon: 'checkin',
            },
            {
              label: 'Results Sheet',
              onClick: () => setPrintDialogType('results'),
              icon: 'results',
              disabled: completedEntries.length === 0,
            },
            {
              label: 'Scoresheet',
              onClick: () => setPrintDialogType('scoresheet'),
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

      <TabBar
        tabs={statusTabs}
        activeTab={activeTab}
        onTabChange={tabId => setActiveTab(tabId as TabType)}
      />

      <layout.PullToRefresh onRefresh={() => refresh(true)} enabled={false} threshold={80}>
        <div className="isolate">
          <div className="pb-8 pt-2">
            <EntryListContent
              entries={currentEntries}
              activeTab={activeTab}
              isDragMode={isDragMode}
              showContext={showContext}
              classInfo={classInfo}
              hasPermission={hasPermission}
              onEntryClick={handlers.handleEntryClick}
              onStatusClick={handlers.handleStatusClick}
              onResetMenuClick={handlers.handleResetMenuClick}
              onSelfCheckinDisabled={() => setSelfCheckinDisabledDialog(true)}
              onPrefetch={handlers.handleEntryPrefetch}
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onOpenDragMode={handlers.handleOpenDragMode}
              {...(favorites ? { favorites } : {})}
              {...(ownership ? { ownership } : {})}
              DogCard={layout.DogCard}
            />
          </div>
        </div>
      </layout.PullToRefresh>

      <layout.FilterPanel
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
        searchTerm={searchTerm}
        onSearchChange={uiActions.setSearchTerm}
        searchPlaceholder="Search dog, handler, breed, armband..."
        sortOptions={sortOptions}
        sortOrder={sortOrder}
        onSortChange={order => {
          setSortOrder(order as 'run' | 'armband' | 'placement' | 'manual');
          setIsDragMode(false);
        }}
        resultsLabel={
          searchTerm
            ? `${filteredEntries.length} of ${localEntries.length} entries`
            : `${currentEntries.length} entries`
        }
      />

      <EntryListDialogs
        classId={classId}
        classInfo={classInfo}
        localEntries={localEntries}
        completedEntries={completedEntries}
        hasPermission={hasPermission}
        hideMaxTimeOption={context.hideMaxTimeOption}
        hideSettingsOption={context.hideSettingsOption}
        activeStatusPopup={activeStatusPopup}
        setActiveStatusPopup={setActiveStatusPopup}
        handleStatusChange={handlers.handleStatusChange}
        runOrderDialogOpen={runOrderDialogOpen}
        setRunOrderDialogOpen={setRunOrderDialogOpen}
        handleApplyRunOrder={handlers.handleApplyRunOrder}
        handleOpenDragMode={handlers.handleOpenDragMode}
        classOptionsDialogOpen={classOptionsDialogOpen}
        setClassOptionsDialogOpen={setClassOptionsDialogOpen}
        setRequirementsDialogOpen={setRequirementsDialogOpen}
        setMaxTimeDialogOpen={setMaxTimeDialogOpen}
        setSettingsDialogOpen={setSettingsDialogOpen}
        setStatusDialogOpen={setStatusDialogOpen}
        handleStatisticsClick={handlers.handleStatisticsClick}
        handlePrintCheckIn={() => setPrintDialogType('check-in')}
        handlePrintResults={() => setPrintDialogType('results')}
        handlePrintScoresheet={() => setPrintDialogType('scoresheet')}
        requirementsDialogOpen={requirementsDialogOpen}
        maxTimeDialogOpen={maxTimeDialogOpen}
        maxTimeRequiredWarning={maxTimeRequiredWarning}
        setMaxTimeRequiredWarning={setMaxTimeRequiredWarning}
        refresh={refresh}
        settingsDialogOpen={settingsDialogOpen}
        noStatsDialogOpen={noStatsDialogOpen}
        setNoStatsDialogOpen={setNoStatsDialogOpen}
        statusDialogOpen={statusDialogOpen}
        handleStatusDialogChange={handlers.handleStatusDialogChange}
        areaCountDialogOpen={areaCountDialogOpen}
        setAreaCountDialogOpen={setAreaCountDialogOpen}
        areaCountRequirements={areaCountRequirements}
        activeResetMenu={activeResetMenu}
        resetMenuPosition={resetMenuPosition}
        handleResetScore={handlers.handleResetScore}
        closeResetMenu={handlers.closeResetMenu}
        resetConfirmDialog={resetConfirmDialog}
        confirmResetScore={handlers.confirmResetScore}
        cancelResetScore={handlers.cancelResetScore}
        selfCheckinDisabledDialog={selfCheckinDisabledDialog}
        setSelfCheckinDisabledDialog={setSelfCheckinDisabledDialog}
        CheckinStatusDialog={dialogs.CheckinStatusDialog}
        RunOrderDialog={dialogs.RunOrderDialog}
        ClassOptionsDialog={dialogs.ClassOptionsDialog}
        ClassRequirementsDialog={dialogs.ClassRequirementsDialog}
        MaxTimeDialog={dialogs.MaxTimeDialog}
        ClassSettingsDialog={dialogs.ClassSettingsDialog}
        NoStatsDialog={dialogs.NoStatsDialog}
        ClassStatusDialog={dialogs.ClassStatusDialog}
        AreaCountSelectionDialog={dialogs.AreaCountSelectionDialog}
      />

      <dialogs.ScoresheetPrintDialog
        isOpen={printDialogType !== null}
        onClose={() => setPrintDialogType(null)}
        onPrint={handlePrintSortOrder}
        title={
          printDialogType === 'check-in'
            ? 'Print Check-In Sheet'
            : printDialogType === 'results'
              ? 'Print Results'
              : 'Print Scoresheet'
        }
        options={
          printDialogType === 'results'
            ? {
                primary: { label: 'Placement', sortOrder: 'placement' },
                secondary: { label: 'Armband Number', sortOrder: 'armband' },
              }
            : undefined
        }
      />

      {/* SuccessToast + FloatingDoneButton are leaf components from
          ringside — imported via dialogs subtree's index. Rendered
          here because EntryListDialogs already renders ResetConfirm /
          ResetMenuPopup / SelfCheckinDisabledDialog; keeping the
          toast/done-button render here matches the host's structure
          and avoids stuffing more concerns into EntryListDialogs. */}
      <SuccessToast isVisible={showSuccessMessage} message="Run order updated successfully" />
      <FloatingDoneButton
        isVisible={isDragMode}
        onClick={() => {
          setIsDragMode(false);
          setSortOrder('run');
        }}
      />
    </div>
  );
};

export default EntryListPage;

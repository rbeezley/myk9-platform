import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import {
  ErrorState,
  PullToRefresh,
  TabBar,
  Tab,
  FilterPanel,
  SortOption,
} from '../../components/ui';
import { AreaCountRequirements } from '../../components/dialogs/AreaCountSelectionDialog';
import {
  ScoresheetPrintDialog,
  type PrintSortOrder,
} from '../../components/dialogs/ScoresheetPrintDialog';
import { Clock, CheckCircle, Trophy, ArrowUpDown, Users, ArrowLeft } from 'lucide-react';
import { Entry } from '../../stores/entryStore';
import {
  useEntryListData,
  useEntryListActions,
  useEntryListFilters,
  useDragAndDropEntries,
  useEntryListHandlers,
  useEntryListEffects,
} from './hooks';
import type { TabType } from './hooks';
import {
  EntryListHeader,
  EntryListContent,
  EntryListDialogs,
  SuccessToast,
  FloatingDoneButton,
} from './components';
// CSS imported in index.css to prevent FOUC

export const EntryList: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { showContext } = useAuth();
  const { hasPermission } = usePermission();

  // Drag state ref - prevents sync-triggered refreshes during drag operations
  const isDraggingRef = useRef<boolean>(false);

  // Data management using shared hook
  const { entries, classInfo, isRefreshing, fetchError, refresh } = useEntryListData({
    classId,
    isDraggingRef,
  });

  // Actions using shared hook
  const {
    handleStatusChange: handleStatusChangeHook,
    handleResetScore: handleResetScoreHook,
    handleMarkInRing,
    handleMarkCompleted,
    isSyncing,
    hasError,
  } = useEntryListActions(refresh);

  // NOTE: Subscription to cache updates is handled by useEntryListData hook
  // which subscribes to entriesTable.subscribe() and classesTable.subscribe().
  // We previously had a duplicate subscription here via manager.onCacheUpdate()
  // that was causing double notifications and performance issues.
  // Removed in favor of the single subscription in the data hook.

  // Local state for UI
  const [localEntries, setLocalEntries] = useState<Entry[]>([]);
  const [manualOrder, setManualOrder] = useState<Entry[]>([]);
  const [activeStatusPopup, setActiveStatusPopup] = useState<number | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [selfCheckinDisabledDialog, setSelfCheckinDisabledDialog] = useState<boolean>(false);
  const [isDragMode, setIsDragMode] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);
  const [runOrderDialogOpen, setRunOrderDialogOpen] = useState(false);
  const [classOptionsDialogOpen, setClassOptionsDialogOpen] = useState(false);
  const [requirementsDialogOpen, setRequirementsDialogOpen] = useState(false);
  const [maxTimeDialogOpen, setMaxTimeDialogOpen] = useState(false);
  const [maxTimeRequiredWarning, setMaxTimeRequiredWarning] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [noStatsDialogOpen, setNoStatsDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isRecalculatingPlacements, setIsRecalculatingPlacements] = useState(false);
  const [areaCountDialogOpen, setAreaCountDialogOpen] = useState(false);
  const [areaCountRequirements, setAreaCountRequirements] = useState<AreaCountRequirements | null>(
    null
  );

  // Print dialog state - tracks which report type to generate
  const [printDialogType, setPrintDialogType] = useState<
    'check-in' | 'results' | 'scoresheet' | null
  >(null);

  // Reset menu state
  const [activeResetMenu, setActiveResetMenu] = useState<number | null>(null);
  const [resetMenuPosition, setResetMenuPosition] = useState<{ top: number; left: number } | null>(
    null
  );
  const [resetConfirmDialog, setResetConfirmDialog] = useState<{
    show: boolean;
    entry: Entry | null;
  }>({ show: false, entry: null });

  // Filtering and sorting (extracted hook)
  const {
    activeTab,
    setActiveTab,
    sortBy: sortOrder,
    setSortBy: setSortOrder,
    searchTerm,
    setSearchTerm,
    filteredEntries,
    pendingEntries,
    completedEntries,
    entryCounts,
  } = useEntryListFilters({
    entries: localEntries,
    prioritizeInRing: true,
    deprioritizePulled: true,
    manualOrder: manualOrder,
    defaultSort: 'run',
  });

  // Current entries based on active tab
  const currentEntries = activeTab === 'pending' ? pendingEntries : completedEntries;

  // Drag and drop (extracted hook)
  const { sensors, handleDragStart, handleDragEnd } = useDragAndDropEntries({
    localEntries,
    setLocalEntries,
    currentEntries,
    isDraggingRef,
    setManualOrder,
  });

  // Effects: sync local entries, auto-open dialogs, initial load tracking
  useEntryListEffects({
    classId,
    classInfo,
    entries,
    setLocalEntries,
    isDraggingRef,
    isRefreshing,
    hasCompletedInitialLoad,
    setHasCompletedInitialLoad,
    setIsLoaded,
    setMaxTimeDialogOpen,
    setMaxTimeRequiredWarning,
    setAreaCountDialogOpen,
    setAreaCountRequirements,
    refresh,
  });

  // Action handlers
  const {
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
    refreshLongPressHandlers,
    handleRecalculatePlacements,
    handlePrintCheckIn,
    handlePrintResults,
    handlePrintScoresheet,
    handleStatusDialogChange,
    handleStatisticsClick,
  } = useEntryListHandlers({
    classId,
    classInfo,
    localEntries,
    setLocalEntries,
    pendingEntries,
    completedEntries,
    currentEntries,
    refresh,
    isRefreshing,
    isManualRefreshing,
    setIsManualRefreshing,
    setActiveStatusPopup,
    setActiveResetMenu,
    setResetMenuPosition,
    setResetConfirmDialog,
    resetConfirmDialog,
    setRunOrderDialogOpen,
    setMaxTimeDialogOpen,
    setMaxTimeRequiredWarning,
    setNoStatsDialogOpen,
    setStatusDialogOpen,
    setShowSuccessMessage,
    setSelfCheckinDisabledDialog,
    setIsDragMode,
    setIsRecalculatingPlacements,
    setManualOrder,
    setActiveTab,
    setSortOrder,
    handleStatusChangeHook,
    handleResetScoreHook,
    handleMarkInRing,
    handleMarkCompleted,
  });

  // Handler for when user picks a sort order from the print dialog
  const handlePrintSortOrder = useCallback(
    (selectedSortOrder: PrintSortOrder) => {
      const type = printDialogType;
      setPrintDialogType(null);
      if (type === 'check-in') handlePrintCheckIn({ sortOrder: selectedSortOrder });
      else if (type === 'results')
        handlePrintResults({
          sortOrder: selectedSortOrder === 'run-order' ? 'placement' : 'armband',
        });
      else if (type === 'scoresheet') handlePrintScoresheet({ sortOrder: selectedSortOrder });
    },
    [printDialogType, handlePrintCheckIn, handlePrintResults, handlePrintScoresheet]
  );

  // Tab configuration
  // NOTE: Use entryCounts (from full entries array) instead of pendingEntries.length/completedEntries.length
  // because those are derived from filteredEntries which is already tab-filtered, causing inactive tab to show 0
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
  const sortOptions: SortOption[] = useMemo(() => {
    const options: SortOption[] = [
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
      <div className="entry-list-container">
        <div className="loading">Loading entries...</div>
      </div>
    );
  }

  // Error state
  if (fetchError) {
    return (
      <div className="entry-list-container">
        <ErrorState
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
      <div className="entry-list-container">
        <div className="empty-state">
          <div className="empty-state-icon">
            <Users size={48} />
          </div>
          <h2 className="empty-state-title">No Entries Yet</h2>
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
    <div className={`entry-list-container${isLoaded ? ' loaded' : ''}`} data-loaded={isLoaded}>
      <EntryListHeader
        classInfo={classInfo}
        isRefreshing={isRefreshing || isManualRefreshing}
        isSyncing={isSyncing}
        hasError={hasError}
        hasActiveFilters={hasActiveFilters}
        onFilterClick={() => setIsFilterPanelOpen(true)}
        onRefresh={handleManualRefresh}
        refreshLongPressHandlers={refreshLongPressHandlers}
        actionsMenu={{
          showRunOrder: hasPermission('canChangeRunOrder'),
          showRecalculatePlacements: hasPermission('canManageClasses'),
          showClassSettings: hasPermission('canManageClasses'),
          isRecalculatingPlacements,
          onRunOrderClick: () => setRunOrderDialogOpen(true),
          onRecalculatePlacements: handleRecalculatePlacements,
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
      />

      <TabBar
        tabs={statusTabs}
        activeTab={activeTab}
        onTabChange={tabId => setActiveTab(tabId as TabType)}
      />

      <PullToRefresh onRefresh={() => refresh(true)} enabled={false} threshold={80}>
        <div className="entry-list-scrollable">
          <div className="entry-list-content">
            <EntryListContent
              entries={currentEntries}
              activeTab={activeTab}
              isDragMode={isDragMode}
              showContext={showContext}
              classInfo={classInfo}
              hasPermission={hasPermission}
              onEntryClick={handleEntryClick}
              onStatusClick={handleStatusClick}
              onResetMenuClick={handleResetMenuClick}
              onSelfCheckinDisabled={() => setSelfCheckinDisabledDialog(true)}
              onPrefetch={handleEntryPrefetch}
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onOpenDragMode={handleOpenDragMode}
            />
          </div>
        </div>
      </PullToRefresh>

      <FilterPanel
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
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
        activeStatusPopup={activeStatusPopup}
        setActiveStatusPopup={setActiveStatusPopup}
        handleStatusChange={handleStatusChange}
        runOrderDialogOpen={runOrderDialogOpen}
        setRunOrderDialogOpen={setRunOrderDialogOpen}
        handleApplyRunOrder={handleApplyRunOrder}
        handleOpenDragMode={handleOpenDragMode}
        classOptionsDialogOpen={classOptionsDialogOpen}
        setClassOptionsDialogOpen={setClassOptionsDialogOpen}
        setRequirementsDialogOpen={setRequirementsDialogOpen}
        setMaxTimeDialogOpen={setMaxTimeDialogOpen}
        setSettingsDialogOpen={setSettingsDialogOpen}
        setStatusDialogOpen={setStatusDialogOpen}
        handleStatisticsClick={handleStatisticsClick}
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
        handleStatusDialogChange={handleStatusDialogChange}
        areaCountDialogOpen={areaCountDialogOpen}
        setAreaCountDialogOpen={setAreaCountDialogOpen}
        areaCountRequirements={areaCountRequirements}
        activeResetMenu={activeResetMenu}
        resetMenuPosition={resetMenuPosition}
        handleResetScore={handleResetScore}
        closeResetMenu={closeResetMenu}
        resetConfirmDialog={resetConfirmDialog}
        confirmResetScore={confirmResetScore}
        cancelResetScore={cancelResetScore}
        selfCheckinDisabledDialog={selfCheckinDisabledDialog}
        setSelfCheckinDisabledDialog={setSelfCheckinDisabledDialog}
      />

      <ScoresheetPrintDialog
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

export default EntryList;

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { usePrefetch } from '@/hooks/usePrefetch';
import { ErrorState, TabBar, Tab, SortOption } from '../../components/ui';
import { RunOrderPreset } from '../../components/dialogs/RunOrderDialog';
import { Clock, CheckCircle, ArrowUpDown, Trophy, RefreshCw } from 'lucide-react';
import { Entry } from '../../stores/entryStore';
import { applyRunOrderPresetScoped } from '../../services/runOrderService';
import type { RunOrderScope, RenumberMode } from '../../services/runOrderService';
import type { PrintSortOrder } from '../../components/dialogs/ScoresheetPrintDialog';
import { getScoresheetRoute } from '../../services/scoresheetRouter';
import { preloadScoresheetByType } from '../../utils/scoresheetPreloader';
import {
  useEntryListData,
  useEntryListActions,
  useEntryListFilters,
  useDragAndDropEntries,
} from './hooks';
import { EntryListHeader, EntryListContent } from './components';
import { CombinedEntryListDialogs } from './CombinedEntryListDialogs';
import { logger } from '@/utils/logger';
import {
  compareEntries,
  getScoresheetNavigationRoute,
  useEntryHandlers,
} from './CombinedEntryList.helpers';
import { dispatchPrintAction } from './CombinedEntryList.print';
import type { SortOrder, PrintDialogState } from './CombinedEntryList.types';
import './EntryList.css';

// Re-export types for external consumers
export type { SortOrder, PrintDialogState, ResetConfirmState } from './CombinedEntryList.types';

export const CombinedEntryList: React.FC = () => {
  const { classIdA, classIdB } = useParams<{ classIdA: string; classIdB: string }>();
  const navigate = useNavigate();
  const { showContext } = useAuth();
  const { hasPermission } = usePermission();
  const { prefetch } = usePrefetch();

  // Drag state ref
  const isDraggingRef = useRef<boolean>(false);

  // Data management using shared hook
  const { entries, classInfo, isRefreshing, fetchError, refresh } = useEntryListData({
    classIdA,
    classIdB,
  });

  // NOTE: React Query automatically fetches on mount when enabled: true

  // Actions using shared hook
  const {
    handleStatusChange: handleStatusChangeHook,
    handleResetScore: handleResetScoreHook,
    handleMarkInRing,
    handleMarkCompleted,
    isSyncing,
    hasError,
  } = useEntryListActions(refresh);

  // Local UI state
  const [localEntries, setLocalEntries] = useState<Entry[]>([]);
  const [_manualOrder, setManualOrder] = useState<Entry[]>([]);
  const [sortOrder, setSortOrder] = useState<SortOrder>('section-armband');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [runOrderDialogOpen, setRunOrderDialogOpen] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [isDragMode, setIsDragMode] = useState(false);
  const [selfCheckinDisabledDialog, setSelfCheckinDisabledDialog] = useState(false);
  const [printDialogState, setPrintDialogState] = useState<PrintDialogState>({ type: null });

  // Filters using shared hook
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

  // Status, reset, and menu handlers (extracted to reduce component size)
  const {
    activeStatusPopup,
    setActiveStatusPopup,
    handleStatusClick,
    handleStatusChange,
    activeResetMenu,
    resetMenuPosition,
    handleResetMenuClick,
    handleResetScore,
    resetConfirmDialog,
    confirmResetScore,
    cancelResetScore,
    closeResetMenu,
  } = useEntryHandlers({
    localEntries,
    setLocalEntries,
    entries,
    handleMarkInRing,
    handleMarkCompleted,
    handleStatusChangeHook,
    handleResetScoreHook,
    refresh,
    setActiveTab,
  });

  // Sync local entries with fetched data
  useEffect(() => {
    if (entries.length > 0 && !isDraggingRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: syncing external data to local state
      setLocalEntries(entries);
    }
  }, [entries]);

  // Initial load animation
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Apply section filter and custom sorting
  const sectionFilteredEntries =
    sectionFilter === 'all'
      ? filteredEntries
      : filteredEntries.filter(e => e.section === sectionFilter);

  const sortedEntries = useMemo(() => {
    return [...sectionFilteredEntries].sort((a, b) => compareEntries(a, b, sortOrder));
  }, [sectionFilteredEntries, sortOrder]);

  const pendingEntries = sortedEntries.filter(e => !e.isScored);
  const completedEntries = sortedEntries.filter(e => e.isScored);
  const currentEntries = activeTab === 'pending' ? pendingEntries : completedEntries;

  // Drag and drop
  const { sensors, handleDragStart, handleDragEnd } = useDragAndDropEntries({
    localEntries,
    setLocalEntries,
    currentEntries,
    isDraggingRef,
    setManualOrder,
  });

  // Scoresheet route helper
  const getScoreSheetRoute = useCallback(
    (entry: Entry): string => {
      return getScoresheetRoute({
        org: showContext?.org || '',
        element: entry.element || '',
        level: entry.level || '',
        classId: entry.classId,
        entryId: entry.id,
        competition_type: showContext?.competition_type || 'Regular',
      });
    },
    [showContext?.org, showContext?.competition_type]
  );

  // Prefetch handler
  const handleEntryPrefetch = useCallback(
    (entry: Entry) => {
      if (entry.isScored || !showContext?.org) return;

      const route = getScoreSheetRoute(entry);
      preloadScoresheetByType(showContext.org, entry.element || '');

      prefetch(`scoresheet-${entry.id}`, async () => ({ entryId: entry.id, route, entry }), {
        ttl: 30,
        priority: 3,
      });

      const currentIndex = pendingEntries.findIndex(e => e.id === entry.id);
      if (currentIndex !== -1) {
        const nextEntries = pendingEntries.slice(currentIndex + 1, currentIndex + 3);
        nextEntries.forEach((nextEntry, offset) => {
          const nextRoute = getScoreSheetRoute(nextEntry);
          prefetch(
            `scoresheet-${nextEntry.id}`,
            async () => ({ entryId: nextEntry.id, route: nextRoute, entry: nextEntry }),
            { ttl: 30, priority: 2 - offset }
          );
        });
      }
    },
    [showContext, prefetch, pendingEntries, getScoreSheetRoute]
  );

  // Score click handler (combined view navigation)
  const handleScoreClick = useCallback(
    (entry: Entry) => {
      if (entry.isScored) return;

      if (!hasPermission('canScore')) {
        alert('You do not have permission to score entries.');
        return;
      }

      const pairedClassId =
        entry.classId === parseInt(classIdA!) ? parseInt(classIdB!) : parseInt(classIdA!);

      const route = getScoresheetNavigationRoute(showContext?.org || '', entry);
      if (route) {
        navigate(route, { state: { pairedClassId } });
      }
    },
    [hasPermission, classIdA, classIdB, showContext?.org, navigate]
  );

  // Run order handlers
  const handleApplyRunOrder = useCallback(
    async (preset: RunOrderPreset, scope?: RunOrderScope, renumberMode?: RenumberMode) => {
      try {
        const reorderedEntries = await applyRunOrderPresetScoped(
          localEntries,
          preset,
          scope || 'all',
          renumberMode || 'renumber'
        );
        setLocalEntries(reorderedEntries);
        setRunOrderDialogOpen(false);
        setShowSuccessMessage(true);
        setSortOrder('run');
        setTimeout(() => setShowSuccessMessage(false), 2000);
        await refresh();
      } catch (error) {
        logger.error('Error applying run order:', error);
        setRunOrderDialogOpen(false);
      }
    },
    [localEntries, refresh]
  );

  const handleOpenDragMode = useCallback(() => {
    setRunOrderDialogOpen(false);
    setManualOrder([...currentEntries]);
    setIsDragMode(true);
    setSortOrder('run');
  }, [currentEntries]);

  // Print sort order handler
  const handlePrintSortOrder = useCallback(
    (selectedSortOrder: PrintSortOrder) => {
      const type = printDialogState.type;
      setPrintDialogState({ type: null });
      dispatchPrintAction(type, selectedSortOrder, classInfo, showContext?.org || '', entries);
    },
    [printDialogState.type, classInfo, showContext?.org, entries]
  );

  // Tab configuration
  const sectionTabs: Tab[] = useMemo(
    () => [
      { id: 'all', label: 'All Sections', count: entries.length },
      { id: 'A', label: 'Section A', count: entries.filter(e => e.section === 'A').length },
      { id: 'B', label: 'Section B', count: entries.filter(e => e.section === 'B').length },
    ],
    [entries]
  );

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

  const sortOptions: SortOption[] = useMemo(() => {
    const options: SortOption[] = [
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
        <ErrorState
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
            onStatusClick={handleStatusClick}
            onResetMenuClick={handleResetMenuClick}
            onSelfCheckinDisabled={() => setSelfCheckinDisabledDialog(true)}
            onPrefetch={handleEntryPrefetch}
            showSectionBadges={true}
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onOpenDragMode={handleOpenDragMode}
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
        onSortChange={order => {
          setSortOrder(order);
          setIsDragMode(false);
        }}
        resultsLabel={
          searchTerm
            ? `${filteredEntries.length} of ${localEntries.length} entries`
            : `${currentEntries.length} entries`
        }
        activeStatusPopup={activeStatusPopup}
        onStatusPopupClose={() => setActiveStatusPopup(null)}
        onStatusChange={handleStatusChange}
        localEntries={localEntries}
        hasCanScorePermission={hasPermission('canScore')}
        runOrderDialogOpen={runOrderDialogOpen}
        onRunOrderClose={() => setRunOrderDialogOpen(false)}
        onApplyRunOrder={handleApplyRunOrder}
        onOpenDragMode={handleOpenDragMode}
        activeResetMenu={activeResetMenu}
        resetMenuPosition={resetMenuPosition}
        onResetScore={handleResetScore}
        onResetMenuClose={closeResetMenu}
        resetConfirmDialog={resetConfirmDialog}
        onConfirmReset={confirmResetScore}
        onCancelReset={cancelResetScore}
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
      />
    </div>
  );
};

export default CombinedEntryList;

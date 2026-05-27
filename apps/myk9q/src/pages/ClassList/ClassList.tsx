import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { usePrefetch } from '@/hooks/usePrefetch';
import { supabase } from '../../lib/supabase';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import type { Entry } from '@/services/replication';
import { logger } from '@/utils/logger';
import { PullToRefresh } from '../../components/ui';
import { useHapticFeedback, useLongPress } from '@myk9/scoring-ui';
import { useSettingsStore } from '@/stores/settingsStore';
// CSS imported in index.css to prevent FOUC
import { ClassFilters } from './ClassFilters';
import { ClassListHeader } from './ClassListHeader';
import { ClassCardGrid } from './ClassCardGrid';
import { ClassListDialogs } from './ClassListDialogs';
import { useClassListData, ClassEntry } from './hooks/useClassListData';
import { useClassDialogs } from '@myk9/ringside';
import { useClassStatus, type StatusDependencies } from './hooks/useClassStatus';
import { useClassRealtime } from './hooks/useClassRealtime';
import {
  usePrintReports,
  type ReportDependencies,
  type ReportOperationResult,
} from './hooks/usePrintReports';
import { useFavoriteClasses } from '@myk9/ringside';
import {
  ScoresheetPrintDialog,
  type PrintSortOrder,
} from '../../components/dialogs/ScoresheetPrintDialog';
import {
  findPairedSectionedClass,
  groupSectionedClasses,
  shouldCombineAllSections,
} from '@myk9/ringside';
import {
  SORT_OPTIONS,
  isMaxTimeSet,
  shouldShowMaxTimeWarning,
  isEmptyDataError,
  filterClasses,
  sortClasses,
  type PrintDialogState,
  type CombinedFilter,
} from '@myk9/ringside';
import {
  ClassListLoading,
  ClassListError,
  ClassListNotFound,
  ClassListEmpty,
} from './ClassListEmptyStates';

export const ClassList: React.FC = () => {
  const { trialId } = useParams<{ trialId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { showContext, role: _role, logout: _logout } = useAuth();
  const { hasPermission, hasRole } = usePermission();
  const canModifyClassSettings = hasRole(['admin', 'judge']);
  const { settings } = useSettingsStore();
  const hapticFeedback = useHapticFeedback(() => settings.hapticFeedback);
  const { prefetch } = usePrefetch();

  // Use React Query for data fetching
  const {
    trialInfo: trialInfoData,
    classes: classesData,
    isLoading,
    isRefreshing,
    error: fetchError,
    refetch,
  } = useClassListData(trialId, showContext?.showId, showContext?.licenseKey);

  // Favorites management (extracted hook)
  const { favoriteClasses, toggleFavorite: toggleFavoriteHook } = useFavoriteClasses(
    showContext?.licenseKey,
    trialId
  );

  // Local state for data (synced from React Query)
  const [trialInfo, setTrialInfo] = useState(trialInfoData ?? null);
  const [classes, setClasses] = useState<ClassEntry[]>([]);

  // Animation state for favorite burst effect
  const [justToggledClassId, setJustToggledClassId] = useState<number | null>(null);
  // Initialize filter from navigation state if provided (e.g., from Show Dashboard "Done" stat)
  const locationState = location.state as { filter?: CombinedFilter } | null;
  const [combinedFilter, setCombinedFilter] = useState<CombinedFilter>(
    locationState?.filter || 'pending'
  );

  // Dialog state management (extracted hook) - excludes status dialog (managed by useClassStatus)
  const {
    activePopup,
    setActivePopup,
    requirementsDialogOpen,
    selectedClassForRequirements,
    setRequirementsDialogOpen,
    setSelectedClassForRequirements,
    maxTimeDialogOpen,
    selectedClassForMaxTime,
    setMaxTimeDialogOpen,
    setSelectedClassForMaxTime,
    settingsDialogOpen,
    selectedClassForSettings,
    setSettingsDialogOpen,
    setSelectedClassForSettings,
  } = useClassDialogs();

  // Class status management (extracted hook)
  const {
    statusDialogOpen,
    selectedClassForStatus,
    setStatusDialogOpen,
    setSelectedClassForStatus,
    handleStatusChange: handleStatusChangeHook,
    handleStatusChangeWithTime: handleStatusChangeWithTimeHook,
  } = useClassStatus();

  // Real-time subscription for class/entry updates (extracted hook)
  useClassRealtime(
    trialId ? Number(trialId) : undefined,
    showContext?.licenseKey,
    setClasses,
    refetch,
    supabase
  );

  // Print report generation (extracted hook)
  const {
    handleGenerateCheckIn: handleCheckInHook,
    handleGenerateResults: handleResultsHook,
    handleGenerateScoresheet: handleScoresheetHook,
  } = usePrintReports();

  // Print dialog state - tracks which report type to generate and for which class
  const [printDialogState, setPrintDialogState] = useState<PrintDialogState>({
    type: null,
    classId: null,
  });

  // Max time warning is local-only (not in shared hook)
  const [showMaxTimeWarning, setShowMaxTimeWarning] = useState(false);

  // No entries dialog state - shown when clicking a class with 0 entries
  const [noEntriesDialogOpen, setNoEntriesDialogOpen] = useState(false);
  const [noEntriesClassName, setNoEntriesClassName] = useState<string | undefined>(undefined);

  // No stats dialog state - shown when clicking Statistics for a class with no scored entries
  const [noStatsDialogOpen, setNoStatsDialogOpen] = useState(false);
  const [noStatsClassName, setNoStatsClassName] = useState<string | undefined>(undefined);

  // Search and sort states
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'class_order' | 'element_level' | 'level_element'>(
    'class_order'
  );
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // Prevent FOUC by adding 'loaded' class after mount
  const [isLoaded, setIsLoaded] = useState(false);

  // Trigger loaded animation after initial render
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Sync React Query data with local state
  useEffect(() => {
    if (trialInfoData) setTrialInfo(trialInfoData);
    if (classesData) setClasses(classesData);
  }, [trialInfoData, classesData]);

  // Update classes' is_favorite property when favoriteClasses changes
  useEffect(() => {
    if (classes.length > 0) {
      setClasses(prevClasses =>
        prevClasses.map(classEntry => ({
          ...classEntry,
          is_favorite: favoriteClasses.has(classEntry.id),
        }))
      );
    }
  }, [favoriteClasses]);

  // Close popup on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.class-popup') && !target.closest('.class-menu-button')) {
        setActivePopup(null);
      }
    };

    if (activePopup !== null) {
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 0);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [activePopup]);

  // Local state for manual refresh feedback (ensures minimum visible duration)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // Manual refresh with forceSync=true to fetch fresh data from server
  const handleRefresh = useCallback(async () => {
    hapticFeedback.medium();
    setIsManualRefreshing(true);
    const minFeedbackDelay = new Promise(resolve => setTimeout(resolve, 500));
    try {
      await Promise.all([refetch(true), minFeedbackDelay]);
    } finally {
      setIsManualRefreshing(false);
    }
  }, [refetch, hapticFeedback]);

  // Hard refresh (full page reload) - triggered by long press on refresh button
  const handleHardRefresh = useCallback(() => {
    logger.log('[ClassList] Hard refresh triggered via long press');
    window.location.reload();
  }, []);

  // Long press handler for refresh button
  const refreshLongPressHandlers = useLongPress(handleHardRefresh, {
    delay: 800,
    enabled: !isRefreshing && !isManualRefreshing,
  });

  // Report dependencies - grouped for cleaner function signatures
  const reportDeps: ReportDependencies = useMemo(
    () => ({
      classes,
      trialInfo,
      licenseKey: showContext?.licenseKey || '',
      organization: showContext?.org || '',
      onComplete: () => setActivePopup(null),
    }),
    [classes, trialInfo, showContext, setActivePopup]
  );

  // Print report wrappers - open sort dialog instead of calling hook directly
  const handleGenerateCheckIn = useCallback((classId: number) => {
    setPrintDialogState({ type: 'check-in', classId });
  }, []);

  const handleGenerateResults = useCallback((classId: number) => {
    setPrintDialogState({ type: 'results', classId });
  }, []);

  const handleGenerateScoresheet = useCallback((classId: number) => {
    setPrintDialogState({ type: 'scoresheet', classId });
  }, []);

  // Handler for when user picks a sort order from the print dialog
  const handlePrintWithSortOrder = useCallback(
    async (selectedSortOrder: PrintSortOrder) => {
      const { type, classId } = printDialogState;
      if (!type || !classId || !showContext?.licenseKey) return;

      setPrintDialogState({ type: null, classId: null });

      let result: ReportOperationResult;

      if (type === 'check-in') {
        result = await handleCheckInHook(classId, reportDeps, { sortOrder: selectedSortOrder });
      } else if (type === 'results') {
        result = await handleResultsHook(classId, reportDeps, {
          sortOrder: selectedSortOrder === 'run-order' ? 'placement' : 'armband',
        });
      } else {
        result = await handleScoresheetHook(classId, reportDeps, { sortOrder: selectedSortOrder });
      }

      if (!result.success && result.error) {
        alert(result.error);
      }
    },
    [
      printDialogState,
      showContext?.licenseKey,
      reportDeps,
      handleCheckInHook,
      handleResultsHook,
      handleScoresheetHook,
    ]
  );

  // Find paired sectioned class (A pairs with B, and vice versa)
  const findPaired = useCallback(
    (clickedClass: ClassEntry): ClassEntry | null => {
      return findPairedSectionedClass(clickedClass, classes, showContext?.org);
    },
    [classes, showContext?.org]
  );

  // Prefetch class entry data when hovering/touching class card
  const handleClassPrefetch = useCallback(
    async (classId: number) => {
      if (!showContext?.licenseKey) return;

      await prefetch(
        `class-entries-${classId}`,
        async () => {
          // Try replicated cache first (offline-first)
          try {
            const manager = await ensureReplicationManager();
            const entriesTable = manager.getTable('entries');
            if (entriesTable) {
              const allEntries = (await entriesTable.getAll()) as Entry[];
              const classEntries = allEntries
                .filter(e => String(e.class_id) === String(classId))
                .sort((a, b) => a.armband - b.armband);

              if (classEntries.length > 0) {
                logger.log('Prefetched class entries from cache:', classId, classEntries.length);
                return classEntries;
              }
            }
          } catch (error) {
            logger.error('Error prefetching entries from cache:', error);
          }

          // Fall back to Supabase if cache miss
          const { data: entriesData } = await supabase
            .from('entries')
            .select(
              `
            *,
            classes!inner (element, level, section, trial_id)
          `
            )
            .eq('class_id', classId)
            .order('armband_number', { ascending: true });

          logger.log('Prefetched class entries from Supabase:', classId, entriesData?.length || 0);
          return entriesData || [];
        },
        {
          ttl: 60, // 1 minute cache
          priority: 3, // High priority - likely next action
        }
      );
    },
    [showContext?.licenseKey, prefetch]
  );

  const handleViewEntries = (classEntry: ClassEntry) => {
    hapticFeedback.medium();

    // Check if class has no entries
    if (classEntry.entry_count === 0) {
      setNoEntriesClassName(classEntry.class_name);
      setNoEntriesDialogOpen(true);
      return;
    }

    // Check if max time warning should be shown
    if (shouldShowMaxTimeWarning() && !isMaxTimeSet(classEntry)) {
      setSelectedClassForMaxTime(classEntry);
      setMaxTimeDialogOpen(true);
      setShowMaxTimeWarning(true);
      return;
    }

    // Check if this is a combined A & B class (has pairedClassId from grouping)
    if (classEntry.pairedClassId) {
      navigate(`/class/${classEntry.id}/${classEntry.pairedClassId}/entries/combined`);
      return;
    }

    // Fallback: Check if this class should be paired based on organization
    const combineAll = shouldCombineAllSections(showContext?.org);
    const shouldCheckForPair =
      (classEntry.section === 'A' || classEntry.section === 'B') &&
      (combineAll || classEntry.level === 'Novice');

    if (shouldCheckForPair) {
      const paired = findPaired(classEntry);
      if (paired) {
        navigate(`/class/${classEntry.id}/${paired.id}/entries/combined`);
        return;
      }
    }

    navigate(`/class/${classEntry.id}/entries`);
  };

  // Status dependencies - grouped for cleaner function signatures
  const statusDeps: StatusDependencies = useMemo(
    () => ({ classes, setClasses, supabaseClient: supabase, refetch }),
    [classes, refetch]
  );

  const handleClassStatusChangeWithTime = useCallback(
    async (classId: number, status: ClassEntry['class_status'], timeValue: string) => {
      await handleStatusChangeWithTimeHook(classId, status, timeValue, statusDeps);
    },
    [handleStatusChangeWithTimeHook, statusDeps]
  );

  const handleClassStatusChange = useCallback(
    async (classId: number, status: ClassEntry['class_status']) => {
      await handleStatusChangeHook(classId, status, statusDeps);
    },
    [handleStatusChangeHook, statusDeps]
  );

  // Wrapper for favorite toggle (delegates to useFavoriteClasses hook, adds haptic feedback)
  const toggleFavorite = useCallback(
    (classId: number) => {
      const classEntry = classes.find(c => c.id === classId);
      const isCurrentlyFavorite = classEntry?.is_favorite;

      if (isCurrentlyFavorite) {
        hapticFeedback.light();
      } else {
        hapticFeedback.medium();
      }

      setJustToggledClassId(classId);
      setTimeout(() => setJustToggledClassId(null), 400);

      toggleFavoriteHook(classId, classEntry?.pairedClassId);

      const pairedId = classEntry?.pairedClassId;
      const idsToToggle = pairedId ? [classId, pairedId] : [classId];
      setClasses(prev =>
        prev.map(c => (idsToToggle.includes(c.id) ? { ...c, is_favorite: !c.is_favorite } : c))
      );
    },
    [classes, hapticFeedback, toggleFavoriteHook]
  );

  // Group sectioned A/B classes into combined entries
  const groupSectionedClassesCached = useCallback(
    (classList: ClassEntry[]): ClassEntry[] => {
      return groupSectionedClasses(classList, showContext?.org);
    },
    [showContext?.org]
  );

  // Memoized grouped classes - used for consistent counts across tabs and panel
  const groupedClasses = useMemo(() => {
    return groupSectionedClassesCached(classes);
  }, [groupSectionedClassesCached, classes]);

  // Memoized filtered and sorted classes
  const filteredClasses = useMemo(() => {
    const filtered = filterClasses(groupedClasses, combinedFilter, searchTerm);
    return sortClasses(filtered, sortOrder);
  }, [groupedClasses, combinedFilter, searchTerm, sortOrder]);

  // --- Early returns for loading/error/empty states ---

  if (isLoading && !trialInfo && classes.length === 0) {
    return <ClassListLoading />;
  }

  const hasEmptyDataError = isEmptyDataError(fetchError);
  if (fetchError && !hasEmptyDataError) {
    return (
      <ClassListError
        errorMessage={fetchError.message}
        onRetry={handleRefresh}
        isRetrying={isRefreshing}
      />
    );
  }

  if (!trialInfo) {
    return <ClassListNotFound onGoBack={() => navigate(-1)} />;
  }

  if (classes.length === 0 && !isLoading) {
    return <ClassListEmpty trialName={trialInfo.trial_name} onGoBack={() => navigate(-1)} />;
  }

  return (
    <div className={`class-list-container ${isLoaded ? 'loaded' : ''}`} data-loaded={isLoaded}>
      <ClassListHeader
        trialInfo={trialInfo}
        isRefreshing={isRefreshing}
        isManualRefreshing={isManualRefreshing}
        searchTerm={searchTerm}
        sortOrder={sortOrder}
        onNavigateHome={() => navigate('/home')}
        onOpenFilterPanel={() => setIsFilterPanelOpen(true)}
        onRefresh={handleRefresh}
        refreshLongPressHandlers={refreshLongPressHandlers}
        showId={showContext?.showId}
      />

      <ClassFilters
        combinedFilter={combinedFilter}
        setCombinedFilter={setCombinedFilter}
        classes={groupedClasses}
        hapticFeedback={hapticFeedback}
      />

      <PullToRefresh onRefresh={handleRefresh} enabled={false} threshold={80}>
        <ClassCardGrid
          filteredClasses={filteredClasses}
          isLoaded={isLoaded}
          hasPermission={hasPermission}
          toggleFavorite={toggleFavorite}
          handleViewEntries={handleViewEntries}
          setActivePopup={setActivePopup}
          setSelectedClassForStatus={setSelectedClassForStatus}
          setStatusDialogOpen={setStatusDialogOpen}
          activePopup={activePopup}
          handleClassPrefetch={handleClassPrefetch}
          justToggledClassId={justToggledClassId}
          showId={showContext?.showId}
        />
      </PullToRefresh>

      <ClassListDialogs
        trialId={trialId}
        organization={showContext?.org || ''}
        canModifyClassSettings={canModifyClassSettings}
        navigate={path => navigate(path)}
        activePopup={activePopup}
        classes={classes}
        setActivePopup={setActivePopup}
        handleGenerateCheckIn={handleGenerateCheckIn}
        handleGenerateResults={handleGenerateResults}
        handleGenerateScoresheet={handleGenerateScoresheet}
        requirementsDialogOpen={requirementsDialogOpen}
        selectedClassForRequirements={selectedClassForRequirements}
        setRequirementsDialogOpen={setRequirementsDialogOpen}
        setSelectedClassForRequirements={setSelectedClassForRequirements}
        maxTimeDialogOpen={maxTimeDialogOpen}
        showMaxTimeWarning={showMaxTimeWarning}
        selectedClassForMaxTime={selectedClassForMaxTime}
        setMaxTimeDialogOpen={setMaxTimeDialogOpen}
        setSelectedClassForMaxTime={setSelectedClassForMaxTime}
        setShowMaxTimeWarning={setShowMaxTimeWarning}
        statusDialogOpen={statusDialogOpen}
        selectedClassForStatus={selectedClassForStatus}
        setStatusDialogOpen={setStatusDialogOpen}
        setSelectedClassForStatus={setSelectedClassForStatus}
        handleClassStatusChange={handleClassStatusChange}
        handleClassStatusChangeWithTime={handleClassStatusChangeWithTime}
        settingsDialogOpen={settingsDialogOpen}
        selectedClassForSettings={selectedClassForSettings}
        setSettingsDialogOpen={setSettingsDialogOpen}
        setSelectedClassForSettings={setSelectedClassForSettings}
        noEntriesDialogOpen={noEntriesDialogOpen}
        noEntriesClassName={noEntriesClassName}
        setNoEntriesDialogOpen={setNoEntriesDialogOpen}
        setNoEntriesClassName={setNoEntriesClassName}
        noStatsDialogOpen={noStatsDialogOpen}
        noStatsClassName={noStatsClassName}
        setNoStatsDialogOpen={setNoStatsDialogOpen}
        setNoStatsClassName={setNoStatsClassName}
        isFilterPanelOpen={isFilterPanelOpen}
        setIsFilterPanelOpen={setIsFilterPanelOpen}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        sortOptions={SORT_OPTIONS}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        filteredClassCount={filteredClasses.length}
        totalClassCount={groupedClasses.length}
        refetch={refetch}
      />

      <ScoresheetPrintDialog
        isOpen={printDialogState.type !== null}
        onClose={() => setPrintDialogState({ type: null, classId: null })}
        onPrint={handlePrintWithSortOrder}
        title={
          printDialogState.type === 'check-in'
            ? 'Print Check-In Sheet'
            : printDialogState.type === 'results'
              ? 'Print Results'
              : 'Print Scoresheet'
        }
        options={
          printDialogState.type === 'results'
            ? {
                primary: { label: 'Placement', sortOrder: 'placement' },
                secondary: { label: 'Armband Number', sortOrder: 'armband' },
              }
            : undefined
        }
      />
    </div>
  );
};

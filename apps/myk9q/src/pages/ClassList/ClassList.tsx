import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { usePrefetch } from '@/hooks/usePrefetch';
import { supabase } from '../../lib/supabase';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import type { Entry } from '@/services/replication';
import { logger } from '@/utils/logger';
import { ErrorState, PullToRefresh } from '../../components/ui';
import { useHapticFeedback, useLongPress } from '@myk9/scoring-ui';
import { useSettingsStore } from '@/stores/settingsStore';
import { ArrowLeft, RefreshCw, List } from 'lucide-react';
// CSS imported in index.css to prevent FOUC
import { getClassDisplayStatus } from '../../utils/statusUtils';
import { getLevelSortOrder } from '../../lib/utils';
import { ClassFilters } from './ClassFilters';
import { ClassListHeader } from './ClassListHeader';
import { ClassCardGrid } from './ClassCardGrid';
import { ClassListDialogs } from './ClassListDialogs';
import { useClassListData, ClassEntry, TrialInfo } from './hooks/useClassListData';
import { useClassDialogs } from './hooks/useClassDialogs';
import { useClassStatus, type StatusDependencies } from './hooks/useClassStatus';
import { useClassRealtime } from './hooks/useClassRealtime';
import { usePrintReports, type ReportDependencies } from './hooks/usePrintReports';
import { useFavoriteClasses } from './hooks/useFavoriteClasses';
import { findPairedSectionedClass, groupSectionedClasses, shouldCombineAllSections } from './utils/noviceClassGrouping';

// eslint-disable-next-line complexity -- Large page component with many dialog/action handlers
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
    refetch
  } = useClassListData(trialId, showContext?.showId, showContext?.licenseKey);

  // Favorites management (extracted hook)
  const {
    favoriteClasses,
    toggleFavorite: toggleFavoriteHook,
  } = useFavoriteClasses(showContext?.licenseKey, trialId);

  // Local state for data (synced from React Query)
  const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(null);
  const [classes, setClasses] = useState<ClassEntry[]>([]);

  // Animation state for favorite burst effect
  const [justToggledClassId, setJustToggledClassId] = useState<number | null>(null);
  // Initialize filter from navigation state if provided (e.g., from Show Dashboard "Done" stat)
  const locationState = location.state as { filter?: 'pending' | 'favorites' | 'completed' } | null;
  const [combinedFilter, setCombinedFilter] = useState<'pending' | 'favorites' | 'completed'>(
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
  const [sortOrder, setSortOrder] = useState<'class_order' | 'element_level' | 'level_element'>('class_order');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // Sort options for FilterPanel
  const sortOptions = [
    { value: 'class_order', label: 'Run Order' },
    { value: 'element_level', label: 'Element → Level' },
    { value: 'level_element', label: 'Level → Element' }
  ];

  // Prevent FOUC by adding 'loaded' class after mount
  const [isLoaded, setIsLoaded] = useState(false);

  // Trigger loaded animation after initial render
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Time input states for status dialog

  // Sync React Query data with local state
  useEffect(() => {
    if (trialInfoData) {
      setTrialInfo(trialInfoData);
    }
    if (classesData) {
      setClasses(classesData);
    }
  }, [trialInfoData, classesData]);

  // Update classes' is_favorite property when favoriteClasses changes (hook handles localStorage)
  useEffect(() => {
    if (classes.length > 0) {
      setClasses(prevClasses =>
        prevClasses.map(classEntry => ({
          ...classEntry,
          is_favorite: favoriteClasses.has(classEntry.id)
        }))
      );
    }
  }, [favoriteClasses]);

  // Data is loaded via useStaleWhileRevalidate hook - no manual loading needed


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

    // Ensure minimum 500ms feedback so users see something happened
    const minFeedbackDelay = new Promise(resolve => setTimeout(resolve, 500));

    try {
      await Promise.all([refetch(true), minFeedbackDelay]); // forceSync=true
    } finally {
      setIsManualRefreshing(false);
    }
  }, [refetch, hapticFeedback]);

  // Hard refresh (full page reload) - triggered by long press on refresh button
  // This is the escape hatch for PWA users who can't access browser refresh
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
  const reportDeps: ReportDependencies = useMemo(() => ({
    classes,
    trialInfo,
    licenseKey: showContext?.licenseKey || '',
    organization: showContext?.org || '',
    onComplete: () => setActivePopup(null)
  }), [classes, trialInfo, showContext, setActivePopup]);

  // Print report wrappers (delegates to usePrintReports hook)
  const handleGenerateCheckIn = useCallback(async (classId: number) => {
    if (!showContext?.licenseKey) return;
    const result = await handleCheckInHook(classId, reportDeps);
    if (!result.success && result.error) {
      alert(result.error);
    }
  }, [handleCheckInHook, showContext?.licenseKey, reportDeps]);

  const handleGenerateResults = useCallback(async (classId: number) => {
    if (!showContext?.licenseKey) return;
    const result = await handleResultsHook(classId, reportDeps);
    if (!result.success && result.error) {
      alert(result.error);
    }
  }, [handleResultsHook, showContext?.licenseKey, reportDeps]);

  const handleGenerateScoresheet = useCallback(async (classId: number) => {
    if (!showContext?.licenseKey) return;
    const result = await handleScoresheetHook(classId, reportDeps);
    if (!result.success && result.error) {
      alert(result.error);
    }
  }, [handleScoresheetHook, showContext?.licenseKey, reportDeps]);

  // Helper function to check if max times are set for a class
  const isMaxTimeSet = (classEntry: ClassEntry): boolean => {
    const { time_limit_seconds, time_limit_area2_seconds, time_limit_area3_seconds } = classEntry;

    // Check if any time limit is set (greater than 0)
    const hasTime1 = Boolean(time_limit_seconds && time_limit_seconds > 0);
    const hasTime2 = Boolean(time_limit_area2_seconds && time_limit_area2_seconds > 0);
    const hasTime3 = Boolean(time_limit_area3_seconds && time_limit_area3_seconds > 0);

    return hasTime1 || hasTime2 || hasTime3;
  };

  // Helper function to check if user role should see max time warning
  const shouldShowMaxTimeWarning = () => {
    // For now, disable max time warnings to allow navigation
    return false;
  };

  // Helper function to find the paired sectioned class (A pairs with B, and vice versa)
  // For UKC Nosework: all levels; for AKC: only Novice
  const findPaired = useCallback((clickedClass: ClassEntry): ClassEntry | null => {
    return findPairedSectionedClass(clickedClass, classes, showContext?.org);
  }, [classes, showContext?.org]);

  // Prefetch class entry data when hovering/touching class card
  const handleClassPrefetch = useCallback(async (classId: number) => {
    if (!showContext?.licenseKey) return;

    await prefetch(
      `class-entries-${classId}`,
      async () => {
        // Try replicated cache first (offline-first)
        try {
          const manager = await ensureReplicationManager();
          const entriesTable = manager.getTable('entries');
          if (entriesTable) {
            const allEntries = await entriesTable.getAll() as Entry[];
            const classEntries = allEntries
              .filter(e => String(e.class_id) === String(classId))
              .sort((a, b) => a.armband_number - b.armband_number);

            if (classEntries.length > 0) {
              logger.log('📡 Prefetched class entries from cache:', classId, classEntries.length);
              return classEntries;
            }
          }
        } catch (error) {
          logger.error('❌ Error prefetching entries from cache:', error);
        }

        // Fall back to Supabase if cache miss
        const { data: entriesData } = await supabase
          .from('entries')
          .select(`
            *,
            classes!inner (element, level, section, trial_id)
          `)
          .eq('class_id', classId)
          .order('armband_number', { ascending: true });

        logger.log('📡 Prefetched class entries from Supabase:', classId, entriesData?.length || 0);
        return entriesData || [];
      },
      {
        ttl: 60, // 1 minute cache
        priority: 3 // High priority - likely next action
      }
    );
  }, [showContext?.licenseKey, prefetch]);

  const handleViewEntries = (classEntry: ClassEntry) => {
    hapticFeedback.medium();

    // Check if class has no entries - show popup instead of navigating to empty page
    if (classEntry.entry_count === 0) {
      setNoEntriesClassName(classEntry.class_name);
      setNoEntriesDialogOpen(true);
      return;
    }

    // Check if max time warning should be shown
    if (shouldShowMaxTimeWarning() && !isMaxTimeSet(classEntry)) {
      // Show MaxTimeDialog with warning instead of separate warning dialog
      setSelectedClassForMaxTime(classEntry);
      setMaxTimeDialogOpen(true);
      setShowMaxTimeWarning(true);
      return;
    }

    // Check if this is a combined A & B class (has pairedClassId from grouping)
    if (classEntry.pairedClassId) {
      // Navigate directly to combined view with both class IDs
      navigate(`/class/${classEntry.id}/${classEntry.pairedClassId}/entries/combined`);
      return;
    }

    // Fallback: Check if this class should be paired based on organization
    // UKC Nosework: all levels with A/B sections; AKC: only Novice
    const combineAll = shouldCombineAllSections(showContext?.org);
    const shouldCheckForPair = (classEntry.section === 'A' || classEntry.section === 'B') &&
      (combineAll || classEntry.level === 'Novice');

    if (shouldCheckForPair) {
      const paired = findPaired(classEntry);
      if (paired) {
        // Navigate directly to combined view with both class IDs (no dialog)
        navigate(`/class/${classEntry.id}/${paired.id}/entries/combined`);
        return;
      }
    }

    // Proceed with navigation (single class or non-pairable)
    navigate(`/class/${classEntry.id}/entries`);
  };

  // Status dependencies - grouped for cleaner function signatures
  const statusDeps: StatusDependencies = useMemo(() => ({
    classes,
    setClasses,
    supabaseClient: supabase,
    refetch
  }), [classes, refetch]);

  // Wrapper for status changes with time (delegates to useClassStatus hook)
  const handleClassStatusChangeWithTime = useCallback(async (
    classId: number,
    status: ClassEntry['class_status'],
    timeValue: string
  ) => {
    await handleStatusChangeWithTimeHook(classId, status, timeValue, statusDeps);
  }, [handleStatusChangeWithTimeHook, statusDeps]);

  // Wrapper for status changes without time (delegates to useClassStatus hook)
  const handleClassStatusChange = useCallback(async (
    classId: number,
    status: ClassEntry['class_status']
  ) => {
    await handleStatusChangeHook(classId, status, statusDeps);
  }, [handleStatusChangeHook, statusDeps]);

  // Wrapper for favorite toggle (delegates to useFavoriteClasses hook, adds haptic feedback)
  const toggleFavorite = useCallback((classId: number) => {
    const classEntry = classes.find(c => c.id === classId);
    const isCurrentlyFavorite = classEntry?.is_favorite;

    // Enhanced haptic feedback for outdoor/gloved use
    if (isCurrentlyFavorite) {
      hapticFeedback.light();  // Removing favorite - softer feedback
    } else {
      hapticFeedback.medium(); // Adding favorite - stronger feedback for confirmation
    }

    // Trigger heart burst animation
    setJustToggledClassId(classId);
    setTimeout(() => setJustToggledClassId(null), 400);

    // Delegate to hook (handles localStorage, paired classes via useEffect syncs to classes)
    toggleFavoriteHook(classId, classEntry?.pairedClassId);

    // Update classes state immediately for responsive UI
    const pairedId = classEntry?.pairedClassId;
    const idsToToggle = pairedId ? [classId, pairedId] : [classId];
    setClasses(prev => prev.map(c =>
      idsToToggle.includes(c.id) ? { ...c, is_favorite: !c.is_favorite } : c
    ));
  }, [classes, hapticFeedback, toggleFavoriteHook]);


  // Helper function to group sectioned A/B classes into combined entries
  // UKC Nosework: all levels; AKC: only Novice
  const groupSectionedClassesCached = useCallback((classList: ClassEntry[]): ClassEntry[] => {
    return groupSectionedClasses(classList, showContext?.org);
  }, [showContext?.org]);

  // Memoized grouped classes - used for consistent counts across tabs and panel
  const groupedClasses = useMemo(() => {
    return groupSectionedClassesCached(classes);
  }, [groupSectionedClassesCached, classes]);

  // Search and sort functionality
  // Memoized filtered and sorted classes for performance optimization
  const filteredClasses = useMemo(() => {
    const filtered = groupedClasses.filter(classEntry => {
      // Use the same logic as getClassDisplayStatus to respect manual status
      const displayStatus = getClassDisplayStatus(classEntry);
      const isCompleted = displayStatus === 'completed';

      // Combined filter logic (existing)
      if (combinedFilter === 'pending' && isCompleted) return false;
      if (combinedFilter === 'completed' && !isCompleted) return false;
      if (combinedFilter === 'favorites' && !classEntry.is_favorite) return false;

      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesClassName = classEntry.class_name.toLowerCase().includes(searchLower);
        const matchesElement = classEntry.element.toLowerCase().includes(searchLower);
        const matchesLevel = classEntry.level.toLowerCase().includes(searchLower);
        const matchesJudge = classEntry.judge_name.toLowerCase().includes(searchLower);
        const matchesSection = classEntry.section && classEntry.section !== '-'
          ? classEntry.section.toLowerCase().includes(searchLower)
          : false;

        if (!matchesClassName && !matchesElement && !matchesLevel && !matchesJudge && !matchesSection) {
          return false;
        }
      }

      return true;
    });

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortOrder) {
        case 'class_order':
          // Default: class_order, then element, then level, then section
          if (a.class_order !== b.class_order) {
            return a.class_order - b.class_order;
          }
          if (a.element !== b.element) {
            return a.element.localeCompare(b.element);
          }
          if (a.level !== b.level) {
            const levelOrder = { 'novice': 1, 'advanced': 2, 'excellent': 3, 'master': 4, 'masters': 4 };
            const aLevelOrder = levelOrder[a.level.toLowerCase() as keyof typeof levelOrder] || 999;
            const bLevelOrder = levelOrder[b.level.toLowerCase() as keyof typeof levelOrder] || 999;
            if (aLevelOrder !== bLevelOrder) {
              return aLevelOrder - bLevelOrder;
            }
            return a.level.localeCompare(b.level);
          }
          return a.section.localeCompare(b.section);

        case 'element_level':
          // Sort by element first, then level (standard progression)
          if (a.element !== b.element) {
            return a.element.localeCompare(b.element);
          }
          if (a.level !== b.level) {
            const aLevelOrder = getLevelSortOrder(a.level);
            const bLevelOrder = getLevelSortOrder(b.level);
            if (aLevelOrder !== bLevelOrder) {
              return aLevelOrder - bLevelOrder;
            }
            return a.level.localeCompare(b.level);
          }
          return a.section.localeCompare(b.section);

        case 'level_element':
          // Sort by level first (standard progression), then element
          if (a.level !== b.level) {
            const aLevelOrder = getLevelSortOrder(a.level);
            const bLevelOrder = getLevelSortOrder(b.level);
            if (aLevelOrder !== bLevelOrder) {
              return aLevelOrder - bLevelOrder;
            }
            return a.level.localeCompare(b.level);
          }
          if (a.element !== b.element) {
            return a.element.localeCompare(b.element);
          }
          return a.section.localeCompare(b.section);

        default:
          return 0;
      }
    });

    return filtered;
  }, [groupedClasses, combinedFilter, searchTerm, sortOrder]);

  // Show loading skeleton only if actively loading and no data exists
  if (isLoading && !trialInfo && classes.length === 0) {
    return (
      <div className="class-list-container">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin mx-auto mb-2" />
            <p className="text-muted-foreground">Loading classes...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state with retry button if fetch failed
  // BUT: "Could not find" errors typically mean empty data (no classes), not a real error
  // So we let those fall through to the empty state handling below
  const isEmptyDataError = fetchError?.message?.toLowerCase().includes('could not find') ||
    fetchError?.message?.toLowerCase().includes('no rows') ||
    fetchError?.message?.toLowerCase().includes('not found');

  if (fetchError && !isEmptyDataError) {
    return (
      <div className="class-list-container">
        <ErrorState
          message={`Failed to load classes: ${fetchError.message || 'Please check your connection and try again.'}`}
          onRetry={handleRefresh}
          isRetrying={isRefreshing}
        />
      </div>
    );
  }

  if (!trialInfo) {
    return (
      <div className="class-list-container">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-foreground text-lg font-semibold mb-2">Trial not found</p>
            <button
              onClick={() => navigate(-1)}
              className="icon-button"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show friendly empty state when trial exists but has no classes
  if (classes.length === 0 && !isLoading) {
    return (
      <div className="class-list-container">
        <div className="empty-state">
          <div className="empty-state-icon">
            <List size={40} strokeWidth={1.5} />
          </div>
          <h2 className="empty-state-title">No Classes Yet</h2>
          {trialInfo?.trial_name && (
            <p className="empty-state-context">{trialInfo.trial_name}</p>
          )}
          <p className="empty-state-message">
            This trial doesn't have any classes set up yet.
            Classes will appear here once they're added.
          </p>
          <div className="empty-state-action">
            <button onClick={() => navigate(-1)}>
              <ArrowLeft size={16} />
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
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
      />

      <ClassFilters
        combinedFilter={combinedFilter}
        setCombinedFilter={setCombinedFilter}
        classes={groupedClasses}
        hapticFeedback={hapticFeedback}
      />

      <PullToRefresh
        onRefresh={handleRefresh}
        enabled
        threshold={80}
      >
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
        />
      </PullToRefresh>

      <ClassListDialogs
        trialId={trialId}
        organization={showContext?.org || ''}
        canModifyClassSettings={canModifyClassSettings}
        navigate={(path) => navigate(path)}
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
        sortOptions={sortOptions}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        filteredClassCount={filteredClasses.length}
        totalClassCount={groupedClasses.length}
        refetch={refetch}
      />
    </div>
  );
};
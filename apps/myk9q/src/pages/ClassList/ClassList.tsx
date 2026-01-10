import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { usePrefetch } from '@/hooks/usePrefetch';
import { supabase } from '../../lib/supabase';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import type { Entry } from '@/services/replication';
import { logger } from '@/utils/logger';
import { markUnscoredEntriesAsAbsent } from '@/services/entryService';
import { HamburgerMenu, CompactOfflineIndicator, TrialDateBadge, RefreshIndicator, ErrorState, PullToRefresh, FilterPanel, FilterTriggerButton } from '../../components/ui';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useLongPress } from '@/hooks/useLongPress';
import { ArrowLeft, RefreshCw, List } from 'lucide-react';
// CSS imported in index.css to prevent FOUC
import { ClassRequirementsDialog } from '../../components/dialogs/ClassRequirementsDialog';
import { MaxTimeDialog } from '../../components/dialogs/MaxTimeDialog';
import { ClassStatusDialog } from '../../components/dialogs/ClassStatusDialog';
import { ClassSettingsDialog } from '../../components/dialogs/ClassSettingsDialog';
import { NoEntriesDialog } from '../../components/dialogs/NoEntriesDialog';
import { NoStatsDialog } from '../../components/dialogs/NoStatsDialog';
import { ClassOptionsDialog } from '../../components/dialogs/ClassOptionsDialog';
import { getClassDisplayStatus } from '../../utils/statusUtils';
import { getLevelSortOrder } from '../../lib/utils';
import { parseOrganizationData, hasRuleDefinedMaxTimes } from '../../utils/organizationUtils';
import { ClassCard } from './ClassCard';
import { ClassFilters } from './ClassFilters';
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
  const hapticFeedback = useHapticFeedback();
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

  const getStatusColor = useCallback((status: ClassEntry['class_status'], classEntry?: ClassEntry) => {
    // PRIORITY 1: Offline scoring status should always use its own color
    // This must be checked BEFORE smart detection to prevent override
    if (status === 'offline-scoring') {
      return 'offline-scoring';
    }

    // Check is_scoring_finalized first for consistent coloring
    if (classEntry) {
      const displayStatus = getClassDisplayStatus(classEntry);
      if (displayStatus === 'completed') return 'completed';
      if (displayStatus === 'in-progress') return 'in-progress';
    }

    switch (status) {
      case 'no-status': return 'no-status';
      case 'setup': return 'setup';
      case 'briefing': return 'briefing';
      case 'break': return 'break';
      case 'start_time': return 'start-time';
      case 'in_progress': return 'in-progress';
      case 'completed': return 'completed';
      default:
        // Note: offline-scoring is handled at the top of the function
        // Intelligent color based on actual class progress
        if (classEntry) {
          const isCompleted = classEntry.completed_count === classEntry.entry_count && classEntry.entry_count > 0;
          const hasDogsInRing = classEntry.dogs.some(dog => dog.in_ring);

          if (isCompleted) return 'completed';
          if (hasDogsInRing) return 'in-progress';
          if (classEntry.completed_count > 0) return 'in-progress';
          return 'no-status';
        }
        return 'no-status';
    }
  }, []);

  // Helper function to format status with time in a structured way
  const getFormattedStatus = useCallback((classEntry: ClassEntry) => {
    // PRIORITY 1: Offline scoring status should always show as-is (user explicitly set it)
    // This must be checked BEFORE smart detection to prevent override
    if (classEntry.class_status === 'offline-scoring') {
      return { label: 'Offline Scoring', time: null };
    }

    // Check is_scoring_finalized first, then fall back to class_status
    const displayStatus = getClassDisplayStatus(classEntry);

    // If detected as completed via is_scoring_finalized or entry counts, show Completed
    if (displayStatus === 'completed') {
      return { label: 'Completed', time: null };
    }

    // If detected as in-progress via scoring activity (dogs scored or in ring), show In Progress
    if (displayStatus === 'in-progress') {
      return { label: 'In Progress', time: null };
    }

    const status = classEntry.class_status;
    const result = (() => {
      switch (status) {
        case 'briefing':
          return {
            label: 'Briefing',
            time: classEntry.briefing_time ?? null
          };
        case 'break':
          return {
            label: 'Break Until',
            time: classEntry.break_until ?? null
          };
        case 'start_time':
          return {
            label: 'Start Time',
            time: classEntry.start_time ?? null
          };
        case 'setup':
          return { label: 'Setup', time: null };
        case 'in_progress':
          return { label: 'In Progress', time: null };
        case 'completed':
          return { label: 'Completed', time: null };
        case 'no-status':
          return { label: 'No Status', time: null };
        default:
          // Note: offline-scoring is handled at the top of the function
          return { label: 'No Status', time: null };
      }
    })();

    return result;
  }, []);

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
      {/* Enhanced Header with Trial Info */}
      <header className="page-header class-list-header">
        <HamburgerMenu
          currentPage="entries"
          backNavigation={{
            label: "Back to Home",
            action: () => navigate('/home')
          }}
        />
        <CompactOfflineIndicator />

        <div className="trial-info">
          <h1>
            <List className="title-icon" />
            {trialInfo.trial_name}
          </h1>
          <div className="trial-subtitle">
            <div className="trial-info-row">
              <div className="trial-details-group">
                <TrialDateBadge
                  date={trialInfo.trial_date}
                  trialNumber={trialInfo.trial_number}
                  dateOnly={true}
                />
                <span className="trial-detail">
                  Trial {trialInfo.trial_number}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="header-buttons">
          {/* Background refresh indicator */}
          {(isRefreshing || isManualRefreshing) && <RefreshIndicator isRefreshing={isRefreshing || isManualRefreshing} />}

          {/* Filter button */}
          <FilterTriggerButton
            onClick={() => setIsFilterPanelOpen(true)}
            hasActiveFilters={searchTerm.length > 0 || sortOrder !== 'class_order'}
          />

          <button
            className="icon-button"
            onClick={handleRefresh}
            disabled={isRefreshing || isManualRefreshing}
            aria-label="Refresh (long press for full reload)"
            title="Refresh (long press for full reload)"
            {...refreshLongPressHandlers}
          >
            <RefreshCw className={`h-5 w-5 ${(isRefreshing || isManualRefreshing) ? 'rotating' : ''}`} />
          </button>
        </div>
      </header>

      {/* Tab Bar for filtering classes */}
      <ClassFilters
        combinedFilter={combinedFilter}
        setCombinedFilter={setCombinedFilter}
        classes={groupedClasses}
        hapticFeedback={hapticFeedback}
      />

      {/* Pull to Refresh Wrapper - wraps only scrollable content */}
      <PullToRefresh
        onRefresh={handleRefresh}
        enabled
        threshold={80}
      >

      {/* Scrollable Content Area - only the grid scrolls */}
      <div className="class-list-scrollable">
        {/* Enhanced Classes List Section */}
        <div className={`grid-responsive ${isLoaded ? 'stagger-children' : ''}`}>
          {filteredClasses.map((classEntry) => (
            <ClassCard
              key={classEntry.id}
              classEntry={classEntry}
              hasPermission={hasPermission}
              toggleFavorite={toggleFavorite}
              handleViewEntries={handleViewEntries}
              setActivePopup={setActivePopup}
              setSelectedClassForStatus={setSelectedClassForStatus}
              setStatusDialogOpen={setStatusDialogOpen}
              activePopup={activePopup}
              getStatusColor={getStatusColor}
              getFormattedStatus={getFormattedStatus}
              onMenuClick={(classId) => {
                setActivePopup(classId);
              }}
              onPrefetch={() => handleClassPrefetch(classEntry.id)}
              justToggledClassId={justToggledClassId}
            />
          ))}
        </div>
      </div>

      {/* Class Options Dialog - Shared reusable component */}
      {(() => {
        const selectedClass = activePopup !== null ? classes.find(c => c.id === activePopup) : null;
        const orgData = parseOrganizationData(showContext?.org || '');
        return (
          <ClassOptionsDialog
            isOpen={activePopup !== null}
            onClose={() => setActivePopup(null)}
            classData={selectedClass ? {
              id: selectedClass.id,
              element: selectedClass.element,
              level: selectedClass.level,
              class_name: selectedClass.class_name,
              entry_count: selectedClass.entry_count,
              completed_count: selectedClass.completed_count,
              class_status: selectedClass.class_status
            } : null}
            onRequirements={() => {
              if (selectedClass) {
                setSelectedClassForRequirements(selectedClass);
                setRequirementsDialogOpen(true);
              }
              return false;
            }}
            onSetMaxTime={() => {
              if (selectedClass) {
                setSelectedClassForMaxTime(selectedClass);
                setMaxTimeDialogOpen(true);
                setShowMaxTimeWarning(false);
              }
              return false;
            }}
            onSettings={() => {
              if (selectedClass) {
                setSelectedClassForSettings(selectedClass);
                setSettingsDialogOpen(true);
              }
              return false;
            }}
            onStatistics={() => {
              if (trialId && selectedClass) {
                if (selectedClass.completed_count === 0) {
                  setNoStatsClassName(selectedClass.class_name);
                  setNoStatsDialogOpen(true);
                  return false; // Don't close dialog
                }
                navigate(`/stats/trial/${trialId}?classId=${selectedClass.id}`);
              }
            }}
            onStatus={() => {
              if (selectedClass) {
                setSelectedClassForStatus(selectedClass);
                setStatusDialogOpen(true);
              }
              return false;
            }}
            onPrintCheckIn={() => {
              if (selectedClass) {
                handleGenerateCheckIn(selectedClass.id);
              }
            }}
            onPrintResults={() => {
              if (selectedClass) {
                handleGenerateResults(selectedClass.id);
              }
            }}
            onPrintScoresheet={() => {
              if (selectedClass) {
                handleGenerateScoresheet(selectedClass.id);
              }
            }}
            hideMaxTime={hasRuleDefinedMaxTimes(orgData) || !canModifyClassSettings}
            hideSettings={!canModifyClassSettings}
          />
        );
      })()}

      {/* Class Requirements Dialog */}
      <ClassRequirementsDialog
        isOpen={requirementsDialogOpen}
        onClose={() => {
          setRequirementsDialogOpen(false);
          setSelectedClassForRequirements(null);
        }}
        onSetMaxTime={hasRuleDefinedMaxTimes(parseOrganizationData(showContext?.org || '')) || !canModifyClassSettings ? undefined : () => {
          // Close requirements dialog and open max time dialog with same class
          setRequirementsDialogOpen(false);
          setSelectedClassForMaxTime(selectedClassForRequirements);
          setMaxTimeDialogOpen(true);
          setShowMaxTimeWarning(false); // No warning for manual access
        }}
        classData={selectedClassForRequirements || {
          id: 0,
          element: '',
          level: '',
          class_name: '',
          entry_count: 0
        }}
      />

      {/* Max Time Dialog */}
      <MaxTimeDialog
        isOpen={maxTimeDialogOpen}
        showWarning={showMaxTimeWarning}
        onClose={() => {
          setMaxTimeDialogOpen(false);
          setSelectedClassForMaxTime(null);
          setShowMaxTimeWarning(false);
        }}
        classData={selectedClassForMaxTime || {
          id: 0,
          element: '',
          level: '',
          class_name: ''
        }}
        onTimeUpdate={() => {
          // Refresh class data after time update
          refetch();
        }}
      />

      </PullToRefresh>

      {/* Class Status Dialog */}
      <ClassStatusDialog
        isOpen={statusDialogOpen}
        onClose={() => {
          setStatusDialogOpen(false);
          setSelectedClassForStatus(null);
        }}
        onStatusChange={(status: string, timeValue?: string) => {
          if (selectedClassForStatus) {
            const typedStatus = status as ClassEntry['class_status'];
            if (timeValue) {
              handleClassStatusChangeWithTime(selectedClassForStatus.id, typedStatus, timeValue);
            } else {
              handleClassStatusChange(selectedClassForStatus.id, typedStatus);
            }
          }
        }}
        classData={selectedClassForStatus ? {
          id: selectedClassForStatus.id,
          element: selectedClassForStatus.element,
          level: selectedClassForStatus.level,
          class_name: selectedClassForStatus.class_name,
          class_status: selectedClassForStatus.class_status,
          entry_count: selectedClassForStatus.entry_count,
          scored_count: selectedClassForStatus.completed_count,
          briefing_time: selectedClassForStatus.briefing_time,
          break_until_time: selectedClassForStatus.break_until,
          start_time: selectedClassForStatus.start_time
        } : {
          id: 0,
          element: '',
          level: '',
          class_name: '',
          class_status: '',
          entry_count: 0,
          scored_count: 0,
          briefing_time: undefined,
          break_until_time: undefined,
          start_time: undefined
        }}
        currentStatus={selectedClassForStatus?.class_status || ''}
        onMarkAbsent={selectedClassForStatus ? async () => {
          // Get all class IDs to mark (including paired class for combined A & B)
          const classIds = selectedClassForStatus.pairedClassId
            ? [selectedClassForStatus.id, selectedClassForStatus.pairedClassId]
            : [selectedClassForStatus.id];

          await markUnscoredEntriesAsAbsent(classIds);
          // Refresh to show updated counts
          await refetch();
        } : undefined}
      />

      {/* Class Settings Dialog */}
      <ClassSettingsDialog
        isOpen={settingsDialogOpen}
        onClose={() => {
          setSettingsDialogOpen(false);
          setSelectedClassForSettings(null);
        }}
        classData={selectedClassForSettings || {
          id: 0,
          element: '',
          level: '',
          class_name: '',
          self_checkin_enabled: true
        }}
        onSettingsUpdate={() => {
          // Refresh class data after settings update
          refetch();
        }}
      />

      {/* No Entries Dialog - shown when clicking a class with 0 entries */}
      <NoEntriesDialog
        isOpen={noEntriesDialogOpen}
        onClose={() => {
          setNoEntriesDialogOpen(false);
          setNoEntriesClassName(undefined);
        }}
        className={noEntriesClassName}
      />

      {/* No Stats Dialog - shown when clicking Statistics for a class with no scored entries */}
      <NoStatsDialog
        isOpen={noStatsDialogOpen}
        onClose={() => {
          setNoStatsDialogOpen(false);
          setNoStatsClassName(undefined);
        }}
        className={noStatsClassName}
      />

      {/* Filter Panel Slide-out */}
      <FilterPanel
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search classes..."
        sortOptions={sortOptions}
        sortOrder={sortOrder}
        onSortChange={(order) => setSortOrder(order as typeof sortOrder)}
        resultsLabel={`${filteredClasses.length} of ${groupedClasses.length} classes`}
        title="Search & Sort Classes"
      />
    </div>
  );
};
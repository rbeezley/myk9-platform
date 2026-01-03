import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { usePrefetch } from '@/hooks/usePrefetch';
import { ErrorState, PullToRefresh, TabBar, Tab, FilterPanel, SortOption } from '../../components/ui';
import { CheckinStatusDialog } from '../../components/dialogs/CheckinStatusDialog';
import { RunOrderDialog, RunOrderPreset } from '../../components/dialogs/RunOrderDialog';
import { ClassOptionsDialog } from '../../components/dialogs/ClassOptionsDialog';
import { ClassRequirementsDialog } from '../../components/dialogs/ClassRequirementsDialog';
import { MaxTimeDialog } from '../../components/dialogs/MaxTimeDialog';
import { ClassSettingsDialog } from '../../components/dialogs/ClassSettingsDialog';
import { NoStatsDialog } from '../../components/dialogs/NoStatsDialog';
import { ClassStatusDialog } from '../../components/dialogs/ClassStatusDialog';
import { AreaCountSelectionDialog, AreaCountRequirements } from '../../components/dialogs/AreaCountSelectionDialog';
import { replicatedClassesTable } from '@/services/replication';
import { Clock, CheckCircle, Trophy, ArrowUpDown, Users, ArrowLeft } from 'lucide-react';
import { generateCheckInSheet, generateResultsSheet, generateScoresheetReport, ReportClassInfo, ScoresheetClassInfo } from '../../services/reportService';
import { parseOrganizationData, hasRuleDefinedMaxTimes, tryApplyFixedMaxTime } from '../../utils/organizationUtils';
import { supabase } from '../../lib/supabase';
import { getScoresheetRoute } from '../../services/scoresheetRouter';
import { markInRing } from '../../services/entryService';
import { applyRunOrderPreset } from '../../services/runOrderService';
import { manuallyRecalculatePlacements } from '../../services/placementService';
import { preloadScoresheetByType } from '../../utils/scoresheetPreloader';
import { Entry } from '../../stores/entryStore';
import { useEntryListData, useEntryListActions, useEntryListFilters, useDragAndDropEntries } from './hooks';
import type { TabType } from './hooks';
import { logger } from '@/utils/logger';
import { useLongPress } from '@/hooks/useLongPress';
import {
  EntryListHeader,
  EntryListContent,
  ResetConfirmDialog,
  SelfCheckinDisabledDialog,
  SuccessToast,
  FloatingDoneButton,
  ResetMenuPopup,
} from './components';
// CSS imported in index.css to prevent FOUC

// eslint-disable-next-line complexity -- Large page component with many dialog/action handlers
export const EntryList: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { showContext, role } = useAuth();
  const { hasPermission, hasRole } = usePermission();
  const canModifyClassSettings = hasRole(['admin', 'judge']);
  const { prefetch } = usePrefetch();

  // Drag state ref - prevents sync-triggered refreshes during drag operations
  const isDraggingRef = useRef<boolean>(false);

  // Data management using shared hook
  const {
    entries,
    classInfo,
    isRefreshing,
    fetchError,
    refresh
  } = useEntryListData({
    classId,
    isDraggingRef
  });

  // Actions using shared hook
  const {
    handleStatusChange: handleStatusChangeHook,
    handleResetScore: handleResetScoreHook,
    handleMarkInRing,
    handleMarkCompleted,
    isSyncing,
    hasError
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
  const [areaCountRequirements, setAreaCountRequirements] = useState<AreaCountRequirements | null>(null);

  // Track if we've already checked for max time requirement (prevent re-triggering after save)
  const hasCheckedMaxTime = useRef(false);
  // Track if we've already checked for area count requirement
  const hasCheckedAreaCount = useRef(false);

  // Reset menu state
  const [activeResetMenu, setActiveResetMenu] = useState<number | null>(null);
  const [resetMenuPosition, setResetMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [resetConfirmDialog, setResetConfirmDialog] = useState<{ show: boolean; entry: Entry | null }>({ show: false, entry: null });

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
    defaultSort: 'run'
  });

  // Current entries based on active tab
  const currentEntries = activeTab === 'pending' ? pendingEntries : completedEntries;

  // Drag and drop (extracted hook)
  const {
    sensors,
    handleDragStart,
    handleDragEnd,
  } = useDragAndDropEntries({
    localEntries,
    setLocalEntries,
    currentEntries,
    isDraggingRef,
    setManualOrder
  });

  // Sync local entries with fetched data
  // NOTE: Duplicate detection was causing "thousands of messages" during sync.
  // Root cause fixed in ReplicatedTableBatch.ts - all IDs now normalized to strings.
  useEffect(() => {
    if (entries.length > 0 && !isDraggingRef.current) {
      setLocalEntries(entries);
    }
  }, [entries]);

  // Set loaded state after initial render
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 250);
    return () => clearTimeout(timer);
  }, []);

  // Track when initial data load completes to distinguish "loading" from "empty class"
  useEffect(() => {
    // When isRefreshing goes from true to false, we've completed a fetch
    if (!isRefreshing && !hasCompletedInitialLoad) {
      // Small delay to ensure state has settled
      const timer = setTimeout(() => setHasCompletedInitialLoad(true), 100);
      return () => clearTimeout(timer);
    }
  }, [isRefreshing, hasCompletedInitialLoad]);

  // Auto-open MaxTimeDialog if max time not set and user can score (runs once per page load)
  // Data-driven: try to auto-apply from class_requirements first, then show dialog if no fixed time
  useEffect(() => {
    // Only run this check once per page load
    if (hasCheckedMaxTime.current) return;

    if (
      hasCompletedInitialLoad &&
      classInfo &&
      hasPermission('canScore') &&
      entries.length > 0  // Class has entries to score
    ) {
      // Mark that we've done the initial check
      hasCheckedMaxTime.current = true;

      // If no max time set, try to auto-apply from database or show dialog
      if (!classInfo.timeLimit) {
        const orgData = parseOrganizationData(showContext?.org || '');

        // Data-driven approach: try to apply fixed time from class_requirements
        // This works for any organization that has time_limit_seconds populated
        tryApplyFixedMaxTime(
          Number(classId),
          orgData.organization,
          classInfo.element,
          classInfo.level
        ).then((result) => {
          if (result.applied) {
            // Fixed time found and applied - refresh to get updated class info
            logger.info(`✅ Auto-applied fixed max time: ${result.time_limit_seconds}s`);
            refresh();
          } else {
            // No fixed time in database - show dialog for judge to set time
            setMaxTimeRequiredWarning(true);
            setMaxTimeDialogOpen(true);
          }
        });
      }
    }
  }, [hasCompletedInitialLoad, classInfo, hasPermission, entries.length, showContext?.org, classId, refresh]);

  // Auto-open AreaCountSelectionDialog for ASCA classes with flexible area count
  // Only for admin/judge roles - exhibitors should NOT see this dialog
  useEffect(() => {
    // Only run this check once per page load
    if (hasCheckedAreaCount.current) return;

    if (
      hasCompletedInitialLoad &&
      classInfo &&
      hasRole(['admin', 'judge']) &&  // Only for admin/judge, not exhibitors
      entries.length > 0
    ) {
      hasCheckedAreaCount.current = true;

      const checkAreaCountRequirement = async () => {
        const orgData = parseOrganizationData(showContext?.org || '');

        // Check class_requirements for flexible area count
        const { data: requirements } = await supabase
          .from('class_requirements')
          .select('area_count, area_count_min, area_count_max, time_limit_seconds')
          .eq('organization', orgData.organization)
          .eq('element', classInfo.element)
          .eq('level', classInfo.level)
          .maybeSingle();

        if (!requirements) return;

        const min = requirements.area_count_min ?? requirements.area_count ?? 1;
        const max = requirements.area_count_max ?? requirements.area_count ?? 1;
        const isFlexible = min !== max;

        if (!isFlexible) return;

        // Check if class already has area_count_confirmed set
        const { data: classData } = await supabase
          .from('classes')
          .select('area_count, area_count_confirmed')
          .eq('id', Number(classId))
          .single();

        // If area_count_confirmed is not true, show the dialog
        // This ensures judges are prompted even if area_count has a default value
        if (!classData?.area_count_confirmed) {
          logger.info(`[EntryList] Class ${classId} needs area count selection (flexible: ${min}-${max})`);
          setAreaCountRequirements({
            min,
            max,
            maxTotalSeconds: requirements.time_limit_seconds ?? 300 // Default 5 min if not set
          });
          setAreaCountDialogOpen(true);
        }
      };

      checkAreaCountRequirement().catch((error) => {
        logger.error('Error checking area count requirement:', error);
      });
    }
  }, [hasCompletedInitialLoad, classInfo, hasRole, entries.length, showContext?.org, classId]);

  // Scoresheet route helper
  const getScoreSheetRoute = useCallback((entry: Entry): string => {
    return getScoresheetRoute({
      org: showContext?.org || '',
      element: entry.element || '',
      level: entry.level || '',
      classId: Number(classId),
      entryId: entry.id,
      competition_type: showContext?.competition_type || 'Regular'
    });
  }, [showContext?.org, showContext?.competition_type, classId]);

  // Set dog in ring status
  // IMPORTANT: Pass entry's current status to markInRing so it can be restored on cancel
  const setDogInRingStatus = useCallback(async (dogId: number, inRing: boolean) => {
    try {
      const currentDog = localEntries.find(entry => entry.id === dogId);

      if (inRing) {
        if (currentDog?.status !== 'in-ring') {
          const otherEntries = localEntries.filter(entry => entry.id !== dogId && entry.status === 'in-ring');
          if (otherEntries.length > 0) {
            await Promise.all(otherEntries.map(entry => markInRing(entry.id, false)));
          }
        }
      }

      // Check using status field (not deprecated inRing property)
      const isCurrentlyInRing = currentDog?.status === 'in-ring';
      if (isCurrentlyInRing !== inRing) {
        // Pass the entry's current status so it can be saved and restored on cancel
        await markInRing(dogId, inRing, currentDog?.status);
      }
      return true;
    } catch (error) {
      logger.error('Error setting dog ring status:', error);
      return false;
    }
  }, [localEntries]);

  // Entry click handler (navigate to scoresheet)
  const handleEntryClick = useCallback((entry: Entry) => {
    if (entry.isScored) return;

    if (!hasPermission('canScore')) {
      alert('You do not have permission to score entries.');
      return;
    }

    // Block scoring if max time not set - try to auto-apply from DB, or show dialog
    if (!classInfo?.timeLimit) {
      const orgData = parseOrganizationData(showContext?.org || '');

      // Data-driven: try to apply fixed time from class_requirements
      if (classInfo) {
        tryApplyFixedMaxTime(
          Number(classId),
          orgData.organization,
          classInfo.element,
          classInfo.level
        ).then((result) => {
          if (result.applied) {
            refresh();
            // Note: User will need to click again after refresh
          } else {
            // No fixed time - show dialog
            setMaxTimeRequiredWarning(true);
            setMaxTimeDialogOpen(true);
          }
        });
      } else {
        setMaxTimeRequiredWarning(true);
        setMaxTimeDialogOpen(true);
      }
      return;
    }

    // Navigate immediately - don't wait for status update
    // The scoresheet will mark the entry as in-ring when it loads (see useEntryNavigation.ts)
    const route = getScoreSheetRoute(entry);

    // Fire-and-forget: update local UI state and DB in background
    // This ensures navigation happens instantly on first click
    if (entry.id && !entry.isScored) {
      // Update local state immediately for visual feedback
      setLocalEntries(prev => prev.map(e =>
        e.id === entry.id ? { ...e, inRing: true, status: 'in-ring' } : e
      ));

      // Background DB update (scoresheet will also call markInRing, but this updates other users' views)
      setDogInRingStatus(entry.id, true).catch(error => {
        logger.error('Failed to update in-ring status:', error);
      });
    }

    // Use React Router for instant client-side navigation (no page reload)
    // Pass entry data via state so scoresheet can render immediately without fetching
    navigate(route, {
      state: {
        entry,
        classInfo: classInfo ? {
          element: classInfo.element,
          level: classInfo.level,
          section: classInfo.section
        } : undefined
      }
    });
  }, [hasPermission, setDogInRingStatus, getScoreSheetRoute, setLocalEntries, navigate, classInfo]);

  // Prefetch handler
  const handleEntryPrefetch = useCallback((entry: Entry) => {
    if (entry.isScored || !showContext?.org) return;

    const route = getScoreSheetRoute(entry);
    preloadScoresheetByType(showContext.org, entry.element || '');

    prefetch(
      `scoresheet-${entry.id}`,
      async () => ({ entryId: entry.id, route, entry }),
      { ttl: 30, priority: 3 }
    );

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
  }, [showContext?.org, prefetch, pendingEntries, getScoreSheetRoute]);

  // Status change handler
  const handleStatusChange = useCallback(async (entryId: number, status: NonNullable<Entry['checkinStatus']> | 'in-ring' | 'completed') => {
    setActiveStatusPopup(null);

    if (status === 'in-ring') {
      // Get entry's current status before updating so it can be restored on cancel
      const currentEntry = localEntries.find(entry => entry.id === entryId);
      const currentStatus = currentEntry?.status;

      setLocalEntries(prev => prev.map(entry =>
        entry.id === entryId ? { ...entry, inRing: true, status: 'in-ring' } : entry
      ));
      try {
        // Pass current status so it can be restored if scoresheet is canceled
        await handleMarkInRing(entryId, currentStatus);
      } catch (error) {
        logger.error('Failed to mark in-ring:', error);
      }
      return;
    }

    if (status === 'completed') {
      setLocalEntries(prev => prev.map(entry =>
        entry.id === entryId ? { ...entry, isScored: true, inRing: false } : entry
      ));
      try {
        await handleMarkCompleted(entryId);
      } catch (error) {
        logger.error('Failed to mark completed:', error);
      }
      return;
    }

    setLocalEntries(prev => prev.map(entry =>
      entry.id === entryId
        ? { ...entry, checkedIn: status !== 'no-status', status: status, inRing: false, _timestamp: Date.now() }
        : entry
    ));

    try {
      await handleStatusChangeHook(entryId, status);
    } catch (error) {
      logger.error('Failed to update status:', error);
    }
  }, [handleMarkInRing, handleMarkCompleted, handleStatusChangeHook, localEntries]);

  // Status click handler
  const handleStatusClick = useCallback((e: React.MouseEvent, entryId: number) => {
    e.preventDefault();
    e.stopPropagation();

    const isSelfCheckinEnabled = classInfo?.selfCheckin ?? true;
    if (role === 'exhibitor' && !isSelfCheckinEnabled) {
      setSelfCheckinDisabledDialog(true);
      return;
    }

    setActiveStatusPopup(entryId);
  }, [classInfo?.selfCheckin, role]);

  // Reset menu handlers
  const handleResetMenuClick = useCallback((e: React.MouseEvent, entryId: number) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Use rect.right so menu extends LEFT from button (via translateX(-100%) in ResetMenuPopup)
    setResetMenuPosition({ top: rect.bottom + 4, left: rect.right });
    setActiveResetMenu(entryId);
  }, []);

  const handleResetScore = useCallback((entry: Entry) => {
    setActiveResetMenu(null);
    setResetMenuPosition(null);
    setResetConfirmDialog({ show: true, entry });
  }, []);

  const confirmResetScore = useCallback(async () => {
    if (!resetConfirmDialog.entry) return;

    setLocalEntries(prev => prev.map(entry =>
      entry.id === resetConfirmDialog.entry!.id
        ? {
          ...entry,
          isScored: false,
          status: 'no-status',
          checkinStatus: 'no-status',
          checkedIn: false,
          resultText: '',
          searchTime: '',
          faultCount: 0,
          placement: undefined,
          inRing: false
        }
        : entry
    ));

    setActiveTab('pending');
    setResetConfirmDialog({ show: false, entry: null });

    try {
      await handleResetScoreHook(resetConfirmDialog.entry.id);
    } catch (error) {
      logger.error('Failed to reset score:', error);
    }
  }, [resetConfirmDialog.entry, handleResetScoreHook, setActiveTab]);

  const cancelResetScore = useCallback(() => {
    setResetConfirmDialog({ show: false, entry: null });
  }, []);

  const closeResetMenu = useCallback(() => {
    setActiveResetMenu(null);
    setResetMenuPosition(null);
  }, []);

  // Run order handlers
  const handleApplyRunOrder = useCallback(async (preset: RunOrderPreset) => {
    try {
      const reorderedEntries = await applyRunOrderPreset(localEntries, preset);
      setLocalEntries(reorderedEntries);
      setRunOrderDialogOpen(false);
      setShowSuccessMessage(true);
      setSortOrder('run');
      setTimeout(() => setShowSuccessMessage(false), 2000);
      await refresh();
    } catch (error) {
      logger.error('❌ Error applying run order:', error);
      setRunOrderDialogOpen(false);
    }
  }, [localEntries, refresh, setSortOrder]);

  const handleOpenDragMode = useCallback(() => {
    setManualOrder([...currentEntries]);
    setSortOrder('manual');
    setIsDragMode(true);
  }, [currentEntries, setSortOrder]);

  // Manual refresh with minimum feedback duration
  // Uses forceSync=true to fetch fresh data from server, not just cache
  const handleManualRefresh = useCallback(async () => {
    setIsManualRefreshing(true);
    const minFeedbackDelay = new Promise(resolve => setTimeout(resolve, 500));
    try {
      await Promise.all([refresh(true), minFeedbackDelay]); // forceSync=true
    } finally {
      setIsManualRefreshing(false);
    }
  }, [refresh]);

  // Hard refresh (full page reload) - triggered by long press on refresh button
  const handleHardRefresh = useCallback(() => {
    logger.log('[EntryList] Hard refresh triggered via long press');
    window.location.reload();
  }, []);

  // Long press handler for refresh button
  const refreshLongPressHandlers = useLongPress(handleHardRefresh, {
    delay: 800,
    enabled: !isRefreshing && !isManualRefreshing,
  });

  // Placement recalculation
  const handleRecalculatePlacements = useCallback(async () => {
    if (!classId) return;

    setIsRecalculatingPlacements(true);
    try {
      await manuallyRecalculatePlacements(Number(classId));
      await refresh();
    } catch (error) {
      logger.error('❌ Failed to recalculate placements:', error);
      alert('Failed to recalculate placements. Please try again.');
    } finally {
      setIsRecalculatingPlacements(false);
    }
  }, [classId, refresh]);

  // Print handlers
  const handlePrintCheckIn = useCallback(() => {
    if (!classInfo) return;

    const orgData = parseOrganizationData(showContext?.org || '');
    const reportClassInfo: ReportClassInfo = {
      className: classInfo.className,
      element: classInfo.element,
      level: classInfo.level,
      section: classInfo.section || '',
      trialDate: classInfo.trialDate || '',
      trialNumber: classInfo.trialNumber || '',
      judgeName: classInfo.judgeName || 'TBD',
      organization: orgData.organization,
      activityType: orgData.activity_type
    };

    generateCheckInSheet(reportClassInfo, localEntries);
  }, [classInfo, showContext?.org, localEntries]);

  const handlePrintResults = useCallback(() => {
    if (!classInfo) return;

    const orgData = parseOrganizationData(showContext?.org || '');
    const reportClassInfo: ReportClassInfo = {
      className: classInfo.className,
      element: classInfo.element,
      level: classInfo.level,
      section: classInfo.section || '',
      trialDate: classInfo.trialDate || '',
      trialNumber: classInfo.trialNumber || '',
      judgeName: classInfo.judgeName || 'TBD',
      organization: orgData.organization,
      activityType: orgData.activity_type
    };

    generateResultsSheet(reportClassInfo, localEntries);
  }, [classInfo, showContext?.org, localEntries]);

  const handlePrintScoresheet = useCallback(async () => {
    if (!classInfo) return;

    const orgData = parseOrganizationData(showContext?.org || '');

    // Parse time limits from string format (e.g., "120" seconds or "2:00" format)
    const parseTimeLimit = (timeStr?: string): number | undefined => {
      if (!timeStr) return undefined;
      // If it's already a number string, convert directly
      const num = parseInt(timeStr, 10);
      if (!isNaN(num)) return num;
      return undefined;
    };

    // Fetch class requirements (hides, distractions) - skip for Master level
    let hidesText: string | undefined;
    let distractionsText: string | undefined;

    const isMasterLevel = classInfo.level?.toLowerCase().includes('master');
    if (!isMasterLevel && orgData.organization && classInfo.element && classInfo.level) {
      try {
        const { data: requirements } = await supabase
          .from('class_requirements')
          .select('hides, distractions')
          .eq('organization', orgData.organization)
          .eq('element', classInfo.element)
          .eq('level', classInfo.level)
          .single();

        if (requirements) {
          hidesText = requirements.hides;
          distractionsText = requirements.distractions;
        }
      } catch (reqError) {
        logger.warn('Could not fetch class requirements:', reqError);
      }
    }

    const scoresheetClassInfo: ScoresheetClassInfo = {
      className: classInfo.className,
      element: classInfo.element,
      level: classInfo.level,
      section: classInfo.section || '',
      trialDate: classInfo.trialDate || '',
      trialNumber: classInfo.trialNumber || '',
      judgeName: classInfo.judgeName || 'TBD',
      organization: orgData.organization,
      activityType: orgData.activity_type,
      timeLimitSeconds: parseTimeLimit(classInfo.timeLimit),
      timeLimitArea2Seconds: parseTimeLimit(classInfo.timeLimit2),
      timeLimitArea3Seconds: parseTimeLimit(classInfo.timeLimit3),
      areaCount: classInfo.areas,
      hidesText,
      distractionsText
    };

    generateScoresheetReport(scoresheetClassInfo, localEntries);
  }, [classInfo, showContext?.org, localEntries]);

  // Handler for status change from ClassStatusDialog
  const handleStatusDialogChange = useCallback(async (status: string, timeValue?: string) => {
    if (!classId) return;

    // Build additional fields for time values
    const additionalFields: Record<string, string> = {};
    if (timeValue) {
      switch (status) {
        case 'briefing':
          additionalFields.briefing_time = timeValue;
          break;
        case 'break':
          additionalFields.break_until = timeValue;
          break;
        case 'start_time':
          additionalFields.start_time = timeValue;
          break;
      }
    }

    try {
      // Update local cache first (offline-first) - syncs to Supabase in background
      await replicatedClassesTable.updateClassStatus(classId, status, additionalFields);

      // Close dialog and refresh UI from cache
      setStatusDialogOpen(false);
      await refresh();
    } catch (error) {
      logger.error('Error updating class status:', error);
      throw error;
    }
  }, [classId, refresh]);

  // Tab configuration
  // NOTE: Use entryCounts (from full entries array) instead of pendingEntries.length/completedEntries.length
  // because those are derived from filteredEntries which is already tab-filtered, causing inactive tab to show 0
  const statusTabs: Tab[] = useMemo(() => [
    { id: 'pending', label: 'Pending', icon: <Clock size={16} />, count: entryCounts.pending },
    { id: 'completed', label: 'Completed', icon: <CheckCircle size={16} />, count: entryCounts.completed }
  ], [entryCounts.pending, entryCounts.completed]);

  // Sort options
  const sortOptions: SortOption[] = useMemo(() => {
    const options: SortOption[] = [
      { value: 'run', label: 'Run Order', icon: <ArrowUpDown size={16} /> },
      { value: 'armband', label: 'Armband', icon: <ArrowUpDown size={16} /> }
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
          {classInfo?.className && (
            <p className="empty-state-class-name">{classInfo.className}</p>
          )}
          <p className="empty-state-message">
            This class doesn't have any entries yet.
            Entries will appear once they are registered.
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
            { label: 'Check-In Sheet', onClick: handlePrintCheckIn, icon: 'checkin' },
            { label: 'Results Sheet', onClick: handlePrintResults, icon: 'results', disabled: completedEntries.length === 0 },
            { label: 'Scoresheet', onClick: handlePrintScoresheet, icon: 'scoresheet' },
          ],
        }}
      />

      <TabBar
        tabs={statusTabs}
        activeTab={activeTab}
        onTabChange={(tabId) => setActiveTab(tabId as TabType)}
      />

      <PullToRefresh onRefresh={() => refresh(true)} enabled threshold={80}>
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
        onSortChange={(order) => {
          setSortOrder(order as 'run' | 'armband' | 'placement' | 'manual');
          setIsDragMode(false);
        }}
        resultsLabel={searchTerm ? `${filteredEntries.length} of ${localEntries.length} entries` : `${currentEntries.length} entries`}
      />

      <CheckinStatusDialog
        isOpen={activeStatusPopup !== null}
        onClose={() => setActiveStatusPopup(null)}
        onStatusChange={(status) => {
          if (activeStatusPopup !== null) {
            handleStatusChange(activeStatusPopup, status);
          }
        }}
        dogInfo={{
          armband: localEntries.find(e => e.id === activeStatusPopup)?.armband || 0,
          callName: localEntries.find(e => e.id === activeStatusPopup)?.callName || '',
          handler: localEntries.find(e => e.id === activeStatusPopup)?.handler || ''
        }}
        showDescriptions={true}
        showRingManagement={hasPermission('canScore')}
      />

      <RunOrderDialog
        isOpen={runOrderDialogOpen}
        onClose={() => setRunOrderDialogOpen(false)}
        entries={localEntries}
        onApplyOrder={handleApplyRunOrder}
        onOpenDragMode={handleOpenDragMode}
      />

      {/* Class Options Dialog (grid of actions) */}
      {classInfo && (
        <ClassOptionsDialog
          isOpen={classOptionsDialogOpen}
          onClose={() => setClassOptionsDialogOpen(false)}
          classData={{
            id: Number(classId),
            element: classInfo.element,
            level: classInfo.level,
            class_name: classInfo.className,
            entry_count: localEntries.length,
            completed_count: completedEntries.length,
            class_status: classInfo.classStatus
          }}
          onRequirements={() => { setRequirementsDialogOpen(true); return false; }}
          onSetMaxTime={() => { setMaxTimeDialogOpen(true); return false; }}
          onSettings={() => { setSettingsDialogOpen(true); return false; }}
          onStatistics={() => {
            if (completedEntries.length === 0) {
              setNoStatsDialogOpen(true);
              return false; // Don't close dialog
            }
            if (classInfo.trialId) {
              navigate(`/stats/trial/${classInfo.trialId}?classId=${classId}`);
            }
          }}
          onStatus={() => { setStatusDialogOpen(true); return false; }}
          onPrintCheckIn={handlePrintCheckIn}
          onPrintResults={handlePrintResults}
          onPrintScoresheet={handlePrintScoresheet}
          hideMaxTime={hasRuleDefinedMaxTimes(parseOrganizationData(showContext?.org || '')) || !canModifyClassSettings}
          hideSettings={!canModifyClassSettings}
        />
      )}

      {/* Class Requirements Dialog */}
      {classInfo && (
        <ClassRequirementsDialog
          isOpen={requirementsDialogOpen}
          onClose={() => setRequirementsDialogOpen(false)}
          onSetMaxTime={hasRuleDefinedMaxTimes(parseOrganizationData(showContext?.org || '')) || !canModifyClassSettings ? undefined : () => {
            setRequirementsDialogOpen(false);
            setMaxTimeDialogOpen(true);
          }}
          classData={{
            id: Number(classId),
            element: classInfo.element,
            level: classInfo.level,
            class_name: classInfo.className,
            entry_count: localEntries.length
          }}
        />
      )}

      {/* Max Time Dialog */}
      {classInfo && (
        <MaxTimeDialog
          isOpen={maxTimeDialogOpen}
          onClose={() => {
            setMaxTimeDialogOpen(false);
            // If dialog was auto-opened due to missing max time, navigate back to class list
            if (maxTimeRequiredWarning) {
              setMaxTimeRequiredWarning(false);
              navigate(-1);
            }
          }}
          showWarning={maxTimeRequiredWarning}
          classData={{
            id: Number(classId),
            element: classInfo.element,
            level: classInfo.level,
            class_name: classInfo.className,
            time_limit_seconds: classInfo.timeLimit ? parseInt(classInfo.timeLimit) : undefined,
            time_limit_area2_seconds: classInfo.timeLimit2 ? parseInt(classInfo.timeLimit2) : undefined,
            time_limit_area3_seconds: classInfo.timeLimit3 ? parseInt(classInfo.timeLimit3) : undefined,
            area_count: classInfo.areas
          }}
          onTimeUpdate={refresh}
        />
      )}

      {/* Class Settings Dialog */}
      {classInfo && (
        <ClassSettingsDialog
          isOpen={settingsDialogOpen}
          onClose={() => setSettingsDialogOpen(false)}
          classData={{
            id: Number(classId),
            element: classInfo.element,
            level: classInfo.level,
            class_name: classInfo.className,
            self_checkin_enabled: classInfo.selfCheckin
          }}
          onSettingsUpdate={refresh}
        />
      )}

      {/* No Stats Dialog */}
      <NoStatsDialog
        isOpen={noStatsDialogOpen}
        onClose={() => setNoStatsDialogOpen(false)}
        className={classInfo?.className || ''}
      />

      {/* Class Status Dialog */}
      {classInfo && (
        <ClassStatusDialog
          isOpen={statusDialogOpen}
          onClose={() => setStatusDialogOpen(false)}
          onStatusChange={handleStatusDialogChange}
          classData={{
            id: Number(classId),
            element: classInfo.element,
            level: classInfo.level,
            class_name: classInfo.className,
            class_status: classInfo.classStatus || 'no-status',
            entry_count: localEntries.length
          }}
          currentStatus={classInfo.classStatus || 'no-status'}
        />
      )}

      {/* Area Count Selection Dialog - for ASCA classes with flexible area count */}
      {classInfo && areaCountRequirements && (
        <AreaCountSelectionDialog
          isOpen={areaCountDialogOpen}
          onClose={() => {
            setAreaCountDialogOpen(false);
            // Navigate back if user cancels without selecting
            navigate(-1);
          }}
          classData={{
            id: Number(classId),
            element: classInfo.element,
            level: classInfo.level,
            class_name: classInfo.className
          }}
          areaCountRequirements={areaCountRequirements}
          onSave={() => {
            setAreaCountDialogOpen(false);
            refresh();
          }}
        />
      )}

      <ResetMenuPopup
        activeEntryId={activeResetMenu}
        position={resetMenuPosition}
        entries={localEntries}
        onResetScore={handleResetScore}
        onClose={closeResetMenu}
      />

      <ResetConfirmDialog
        isOpen={resetConfirmDialog.show}
        entry={resetConfirmDialog.entry}
        onConfirm={confirmResetScore}
        onCancel={cancelResetScore}
      />

      <SelfCheckinDisabledDialog
        isOpen={selfCheckinDisabledDialog}
        onClose={() => setSelfCheckinDisabledDialog(false)}
      />

      <SuccessToast
        isVisible={showSuccessMessage}
        message="Run order updated successfully"
      />

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

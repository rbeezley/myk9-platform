import { useCallback, Dispatch, SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { usePermission } from '../../../hooks/usePermission';
import { usePrefetch } from '@/hooks/usePrefetch';
import { RunOrderPreset } from '../../../components/dialogs/RunOrderDialog';
import {
  generateCheckInSheet,
  generateResultsSheet,
  generateScoresheetReport,
  ReportClassInfo,
  ScoresheetClassInfo,
  type ReportSortOrder,
} from '../../../services/reportService';
import { parseOrganizationData, tryApplyFixedMaxTime } from '../../../utils/organizationUtils';
import { supabase } from '../../../lib/supabase';
import { getScoresheetRoute } from '../../../services/scoresheetRouter';
import { markInRing } from '../../../services/entryService';
import { applyRunOrderPreset } from '../../../services/runOrderService';
import { manuallyRecalculatePlacements } from '../../../services/placementService';
import { preloadScoresheetByType } from '../../../utils/scoresheetPreloader';
import { replicatedClassesTable } from '@/services/replication';
import { Entry } from '../../../stores/entryStore';
import { useLongPress } from '@myk9/scoring-ui';
import { logger } from '@/utils/logger';
import type { ClassInfo } from './useEntryListData';
import type { TabType, SortType } from './useEntryListFilters';

interface UseEntryListHandlersParams {
  classId: string | undefined;
  classInfo: ClassInfo | null;
  localEntries: Entry[];
  setLocalEntries: Dispatch<SetStateAction<Entry[]>>;
  pendingEntries: Entry[];
  completedEntries: Entry[];
  currentEntries: Entry[];
  refresh: (forceSync?: boolean) => Promise<void>;
  isRefreshing: boolean;
  isManualRefreshing: boolean;
  setIsManualRefreshing: Dispatch<SetStateAction<boolean>>;
  setActiveStatusPopup: Dispatch<SetStateAction<number | null>>;
  setActiveResetMenu: Dispatch<SetStateAction<number | null>>;
  setResetMenuPosition: Dispatch<SetStateAction<{ top: number; left: number } | null>>;
  setResetConfirmDialog: Dispatch<SetStateAction<{ show: boolean; entry: Entry | null }>>;
  resetConfirmDialog: { show: boolean; entry: Entry | null };
  setRunOrderDialogOpen: Dispatch<SetStateAction<boolean>>;
  setMaxTimeDialogOpen: Dispatch<SetStateAction<boolean>>;
  setMaxTimeRequiredWarning: Dispatch<SetStateAction<boolean>>;
  setNoStatsDialogOpen: Dispatch<SetStateAction<boolean>>;
  setStatusDialogOpen: Dispatch<SetStateAction<boolean>>;
  setShowSuccessMessage: Dispatch<SetStateAction<boolean>>;
  setSelfCheckinDisabledDialog: Dispatch<SetStateAction<boolean>>;
  setIsDragMode: Dispatch<SetStateAction<boolean>>;
  setIsRecalculatingPlacements: Dispatch<SetStateAction<boolean>>;
  setManualOrder: Dispatch<SetStateAction<Entry[]>>;
  setActiveTab: (tab: TabType) => void;
  setSortOrder: (sort: SortType) => void;
  handleStatusChangeHook: (
    entryId: number,
    status: 'no-status' | 'checked-in' | 'conflict' | 'pulled' | 'at-gate' | 'come-to-gate'
  ) => Promise<void>;
  handleResetScoreHook: (entryId: number) => Promise<void>;
  handleMarkInRing: (entryId: number, currentStatus?: Entry['status']) => Promise<void>;
  handleMarkCompleted: (entryId: number) => Promise<void>;
}

export function useEntryListHandlers({
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
}: UseEntryListHandlersParams) {
  const navigate = useNavigate();
  const { showContext, role } = useAuth();
  const { hasPermission } = usePermission();
  const { prefetch } = usePrefetch();

  // Scoresheet route helper
  const getScoreSheetRoute = useCallback(
    (entry: Entry): string => {
      return getScoresheetRoute({
        org: showContext?.org || '',
        element: entry.element || '',
        level: entry.level || '',
        classId: Number(classId),
        entryId: entry.id,
        competition_type: showContext?.competition_type || 'Regular',
      });
    },
    [showContext?.org, showContext?.competition_type, classId]
  );

  // Set dog in ring status
  const setDogInRingStatus = useCallback(
    async (dogId: number, inRing: boolean) => {
      try {
        const currentDog = localEntries.find(entry => entry.id === dogId);

        if (inRing) {
          if (currentDog?.status !== 'in-ring') {
            const otherEntries = localEntries.filter(
              entry => entry.id !== dogId && entry.status === 'in-ring'
            );
            if (otherEntries.length > 0) {
              await Promise.all(otherEntries.map(entry => markInRing(entry.id, false)));
            }
          }
        }

        const isCurrentlyInRing = currentDog?.status === 'in-ring';
        if (isCurrentlyInRing !== inRing) {
          await markInRing(dogId, inRing, currentDog?.status);
        }
        return true;
      } catch (error) {
        logger.error('Error setting dog ring status:', error);
        return false;
      }
    },
    [localEntries]
  );

  // Entry click handler (navigate to scoresheet)
  const handleEntryClick = useCallback(
    (entry: Entry) => {
      if (entry.isScored) return;

      if (!hasPermission('canScore')) {
        alert('You do not have permission to score entries.');
        return;
      }

      // Block scoring if max time not set - try to auto-apply from DB, or show dialog
      if (!classInfo?.timeLimit) {
        const orgData = parseOrganizationData(showContext?.org || '');

        if (classInfo) {
          tryApplyFixedMaxTime(
            Number(classId),
            orgData.organization,
            classInfo.element,
            classInfo.level
          ).then(result => {
            if (result.applied) {
              refresh();
            } else {
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
      const route = getScoreSheetRoute(entry);

      // Fire-and-forget: update local UI state and DB in background
      if (entry.id && !entry.isScored) {
        setLocalEntries(prev =>
          prev.map(e => (e.id === entry.id ? { ...e, inRing: true, status: 'in-ring' } : e))
        );

        setDogInRingStatus(entry.id, true).catch(error => {
          logger.error('Failed to update in-ring status:', error);
        });
      }

      navigate(route, {
        state: {
          entry,
          classInfo: classInfo
            ? {
                element: classInfo.element,
                level: classInfo.level,
                section: classInfo.section,
              }
            : undefined,
        },
      });
    },
    [
      hasPermission,
      setDogInRingStatus,
      getScoreSheetRoute,
      setLocalEntries,
      navigate,
      classInfo,
      showContext?.org,
      classId,
      refresh,
      setMaxTimeRequiredWarning,
      setMaxTimeDialogOpen,
    ]
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
    [showContext?.org, prefetch, pendingEntries, getScoreSheetRoute]
  );

  // Status change handler
  const handleStatusChange = useCallback(
    async (
      entryId: number,
      status: NonNullable<Entry['checkinStatus']> | 'in-ring' | 'completed'
    ) => {
      setActiveStatusPopup(null);

      if (status === 'in-ring') {
        const currentEntry = localEntries.find(entry => entry.id === entryId);
        const currentStatus = currentEntry?.status;

        setLocalEntries(prev =>
          prev.map(entry =>
            entry.id === entryId ? { ...entry, inRing: true, status: 'in-ring' } : entry
          )
        );
        try {
          await handleMarkInRing(entryId, currentStatus);
        } catch (error) {
          logger.error('Failed to mark in-ring:', error);
        }
        return;
      }

      if (status === 'completed') {
        setLocalEntries(prev =>
          prev.map(entry =>
            entry.id === entryId ? { ...entry, isScored: true, inRing: false } : entry
          )
        );
        try {
          await handleMarkCompleted(entryId);
        } catch (error) {
          logger.error('Failed to mark completed:', error);
        }
        return;
      }

      setLocalEntries(prev =>
        prev.map(entry =>
          entry.id === entryId
            ? {
                ...entry,
                checkedIn: status !== 'no-status',
                status: status,
                inRing: false,
                _timestamp: Date.now(),
              }
            : entry
        )
      );

      try {
        await handleStatusChangeHook(entryId, status);
      } catch (error) {
        logger.error('Failed to update status:', error);
      }
    },
    [
      handleMarkInRing,
      handleMarkCompleted,
      handleStatusChangeHook,
      localEntries,
      setActiveStatusPopup,
      setLocalEntries,
    ]
  );

  // Status click handler
  const handleStatusClick = useCallback(
    (e: React.MouseEvent, entryId: number) => {
      e.preventDefault();
      e.stopPropagation();

      const isSelfCheckinEnabled = classInfo?.selfCheckin ?? true;
      if (role === 'exhibitor' && !isSelfCheckinEnabled) {
        setSelfCheckinDisabledDialog(true);
        return;
      }

      setActiveStatusPopup(entryId);
    },
    [classInfo?.selfCheckin, role, setSelfCheckinDisabledDialog, setActiveStatusPopup]
  );

  // Reset menu handlers
  const handleResetMenuClick = useCallback(
    (e: React.MouseEvent, entryId: number) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setResetMenuPosition({ top: rect.bottom + 4, left: rect.right });
      setActiveResetMenu(entryId);
    },
    [setResetMenuPosition, setActiveResetMenu]
  );

  const handleResetScore = useCallback(
    (entry: Entry) => {
      setActiveResetMenu(null);
      setResetMenuPosition(null);
      setResetConfirmDialog({ show: true, entry });
    },
    [setActiveResetMenu, setResetMenuPosition, setResetConfirmDialog]
  );

  const confirmResetScore = useCallback(async () => {
    if (!resetConfirmDialog.entry) return;

    setLocalEntries(prev =>
      prev.map(entry =>
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
              inRing: false,
            }
          : entry
      )
    );

    setActiveTab('pending');
    setResetConfirmDialog({ show: false, entry: null });

    try {
      await handleResetScoreHook(resetConfirmDialog.entry.id);
    } catch (error) {
      logger.error('Failed to reset score:', error);
    }
  }, [
    resetConfirmDialog.entry,
    handleResetScoreHook,
    setActiveTab,
    setLocalEntries,
    setResetConfirmDialog,
  ]);

  const cancelResetScore = useCallback(() => {
    setResetConfirmDialog({ show: false, entry: null });
  }, [setResetConfirmDialog]);

  const closeResetMenu = useCallback(() => {
    setActiveResetMenu(null);
    setResetMenuPosition(null);
  }, [setActiveResetMenu, setResetMenuPosition]);

  // Run order handlers
  const handleApplyRunOrder = useCallback(
    async (preset: RunOrderPreset) => {
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
    },
    [
      localEntries,
      refresh,
      setSortOrder,
      setLocalEntries,
      setRunOrderDialogOpen,
      setShowSuccessMessage,
    ]
  );

  const handleOpenDragMode = useCallback(() => {
    setManualOrder([...currentEntries]);
    setSortOrder('manual');
    setIsDragMode(true);
  }, [currentEntries, setSortOrder, setManualOrder, setIsDragMode]);

  // Manual refresh with minimum feedback duration
  const handleManualRefresh = useCallback(async () => {
    setIsManualRefreshing(true);
    const minFeedbackDelay = new Promise(resolve => setTimeout(resolve, 500));
    try {
      await Promise.all([refresh(true), minFeedbackDelay]);
    } finally {
      setIsManualRefreshing(false);
    }
  }, [refresh, setIsManualRefreshing]);

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
  }, [classId, refresh, setIsRecalculatingPlacements]);

  // Print handlers
  const handlePrintCheckIn = useCallback(
    (options?: { sortOrder?: ReportSortOrder }) => {
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
        activityType: orgData.activity_type,
      };

      generateCheckInSheet(reportClassInfo, localEntries, options);
    },
    [classInfo, showContext?.org, localEntries]
  );

  const handlePrintResults = useCallback(
    (options?: { sortOrder?: 'placement' | 'armband' }) => {
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
        activityType: orgData.activity_type,
      };

      generateResultsSheet(reportClassInfo, localEntries, options);
    },
    [classInfo, showContext?.org, localEntries]
  );

  const handlePrintScoresheet = useCallback(
    async (options?: { sortOrder?: ReportSortOrder; showSectionBadge?: boolean }) => {
      if (!classInfo) return;

      const orgData = parseOrganizationData(showContext?.org || '');

      const parseTimeLimit = (timeStr?: string): number | undefined => {
        if (!timeStr) return undefined;
        const num = parseInt(timeStr, 10);
        if (!isNaN(num)) return num;
        return undefined;
      };

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
        distractionsText,
      };

      generateScoresheetReport(scoresheetClassInfo, localEntries, options);
    },
    [classInfo, showContext?.org, localEntries]
  );

  // Handler for status change from ClassStatusDialog
  const handleStatusDialogChange = useCallback(
    async (status: string, timeValue?: string) => {
      if (!classId) return;

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
        await replicatedClassesTable.updateClassStatus(classId, status, additionalFields);
        setStatusDialogOpen(false);
        await refresh();
      } catch (error) {
        logger.error('Error updating class status:', error);
        throw error;
      }
    },
    [classId, refresh, setStatusDialogOpen]
  );

  // Navigation handlers for ClassOptionsDialog
  const handleStatisticsClick = useCallback(() => {
    if (completedEntries.length === 0) {
      setNoStatsDialogOpen(true);
      return false;
    }
    if (classInfo?.trialId) {
      navigate(`/stats/trial/${classInfo.trialId}?classId=${classId}`);
    }
  }, [completedEntries.length, classInfo?.trialId, classId, navigate, setNoStatsDialogOpen]);

  return {
    getScoreSheetRoute,
    setDogInRingStatus,
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
    handleHardRefresh,
    refreshLongPressHandlers,
    handleRecalculatePlacements,
    handlePrintCheckIn,
    handlePrintResults,
    handlePrintScoresheet,
    handleStatusDialogChange,
    handleStatisticsClick,
  };
}

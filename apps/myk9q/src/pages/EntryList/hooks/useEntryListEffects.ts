import { useEffect, useRef, Dispatch, SetStateAction, MutableRefObject } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { usePermission } from '../../../hooks/usePermission';
import { parseOrganizationData, tryApplyFixedMaxTime } from '../../../utils/organizationUtils';
import { supabase } from '../../../lib/supabase';
import { Entry } from '../../../stores/entryStore';
import { logger } from '@/utils/logger';
import type { ClassInfo } from './useEntryListData';
import type { AreaCountRequirements } from '../../../components/dialogs/AreaCountSelectionDialog';

interface UseEntryListEffectsParams {
  classId: string | undefined;
  classInfo: ClassInfo | null;
  entries: Entry[];
  setLocalEntries: Dispatch<SetStateAction<Entry[]>>;
  isDraggingRef: MutableRefObject<boolean>;
  isRefreshing: boolean;
  hasCompletedInitialLoad: boolean;
  setHasCompletedInitialLoad: Dispatch<SetStateAction<boolean>>;
  setIsLoaded: Dispatch<SetStateAction<boolean>>;
  setMaxTimeDialogOpen: Dispatch<SetStateAction<boolean>>;
  setMaxTimeRequiredWarning: Dispatch<SetStateAction<boolean>>;
  setAreaCountDialogOpen: Dispatch<SetStateAction<boolean>>;
  setAreaCountRequirements: Dispatch<SetStateAction<AreaCountRequirements | null>>;
  refresh: (forceSync?: boolean) => Promise<void>;
}

export function useEntryListEffects({
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
}: UseEntryListEffectsParams) {
  const { showContext } = useAuth();
  const { hasPermission, hasRole } = usePermission();

  // Track if we've already checked for max time requirement (prevent re-triggering after save)
  const hasCheckedMaxTime = useRef(false);
  // Track if we've already checked for area count requirement
  const hasCheckedAreaCount = useRef(false);

  // Sync local entries with fetched data
  useEffect(() => {
    if (entries.length > 0 && !isDraggingRef.current) {
      setLocalEntries(entries);
    }
  }, [entries, isDraggingRef, setLocalEntries]);

  // Set loaded state after initial render
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 250);
    return () => clearTimeout(timer);
  }, [setIsLoaded]);

  // Track when initial data load completes to distinguish "loading" from "empty class"
  useEffect(() => {
    if (!isRefreshing && !hasCompletedInitialLoad) {
      const timer = setTimeout(() => setHasCompletedInitialLoad(true), 100);
      return () => clearTimeout(timer);
    }
  }, [isRefreshing, hasCompletedInitialLoad, setHasCompletedInitialLoad]);

  // Auto-open MaxTimeDialog if max time not set and user can score (runs once per page load)
  useEffect(() => {
    if (hasCheckedMaxTime.current) return;

    if (
      hasCompletedInitialLoad &&
      classInfo &&
      hasPermission('canScore') &&
      entries.length > 0
    ) {
      hasCheckedMaxTime.current = true;

      if (!classInfo.timeLimit) {
        const orgData = parseOrganizationData(showContext?.org || '');

        tryApplyFixedMaxTime(
          Number(classId),
          orgData.organization,
          classInfo.element,
          classInfo.level
        ).then((result) => {
          if (result.applied) {
            logger.info(`✅ Auto-applied fixed max time: ${result.time_limit_seconds}s`);
            refresh();
          } else {
            setMaxTimeRequiredWarning(true);
            setMaxTimeDialogOpen(true);
          }
        });
      }
    }
  }, [hasCompletedInitialLoad, classInfo, hasPermission, entries.length, showContext?.org, classId, refresh, setMaxTimeRequiredWarning, setMaxTimeDialogOpen]);

  // Auto-open AreaCountSelectionDialog for ASCA classes with flexible area count
  useEffect(() => {
    if (hasCheckedAreaCount.current) return;

    if (
      hasCompletedInitialLoad &&
      classInfo &&
      hasRole(['admin', 'judge']) &&
      entries.length > 0
    ) {
      hasCheckedAreaCount.current = true;

      const checkAreaCountRequirement = async () => {
        const orgData = parseOrganizationData(showContext?.org || '');

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

        const { data: classData } = await supabase
          .from('classes')
          .select('area_count, area_count_confirmed')
          .eq('id', Number(classId))
          .single();

        if (!classData?.area_count_confirmed) {
          logger.info(`[EntryList] Class ${classId} needs area count selection (flexible: ${min}-${max})`);
          setAreaCountRequirements({
            min,
            max,
            maxTotalSeconds: requirements.time_limit_seconds ?? 300
          });
          setAreaCountDialogOpen(true);
        }
      };

      checkAreaCountRequirement().catch((error) => {
        logger.error('Error checking area count requirement:', error);
      });
    }
  }, [hasCompletedInitialLoad, classInfo, hasRole, entries.length, showContext?.org, classId, setAreaCountRequirements, setAreaCountDialogOpen]);
}

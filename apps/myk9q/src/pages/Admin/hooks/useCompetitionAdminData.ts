/**
 * React Query hooks for CompetitionAdmin page
 *
 * Demonstrates React Query integration as proof-of-concept for replacing manual caching.
 * Benefits:
 * - Automatic caching with configurable stale/cache times
 * - Deduplication (multiple components requesting same data = 1 network call)
 * - Background refetching
 * - Built-in loading/error states
 * - Query invalidation helpers
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import type { VisibilityPreset } from '../../../types/visibility';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface ClassInfo {
  id: number;
  trial_id: number;
  element: string;
  level: string;
  section: string;
  judge_name: string;
  trial_date: string;
  trial_number: string;
  class_completed: boolean;
  results_released_at: string | null;
  results_released_by: string | null;
  class_completed_at: string | null;
  self_checkin: boolean;
  total_entries?: number;
  scored_entries?: number;
  visibility_preset?: VisibilityPreset;
}

export interface TrialInfo {
  trial_id: number;
  trial_date: string;
  trial_number: number;
  judges: string[];
  class_count: number;
  visibility_preset?: VisibilityPreset;
}

/** Raw class data from view_class_summary Supabase view */
interface RawClassSummaryData {
  class_id: number;
  trial_id: number;
  element: string;
  level: string;
  section: string;
  judge_name: string;
  trial_date?: string;
  trial_number?: number;
  is_scoring_finalized?: boolean;
  self_checkin_enabled?: boolean;
  total_entries?: number;
  scored_entries?: number;
}

/** Raw visibility override from class_result_visibility_overrides table */
interface RawVisibilityOverride {
  class_id: number;
  preset_name: VisibilityPreset;
}

export interface ShowInfo {
  showName: string;
  organization: string;
}

// ============================================================
// QUERY KEYS (centralized for easy invalidation)
// ============================================================

export const competitionAdminKeys = {
  all: (licenseKey: string) => ['competitionAdmin', licenseKey] as const,
  showInfo: (licenseKey: string) => ['competitionAdmin', licenseKey, 'showInfo'] as const,
  classes: (licenseKey: string) => ['competitionAdmin', licenseKey, 'classes'] as const,
  trials: (licenseKey: string) => ['competitionAdmin', licenseKey, 'trials'] as const,
};

// ============================================================
// FETCH FUNCTIONS
// ============================================================

/**
 * Fetch show information
 */
async function fetchShowInfo(licenseKey: string): Promise<ShowInfo | null> {
  const { data, error } = await supabase
    .from('shows')
    .select('show_name, organization')
    .eq('license_key', licenseKey)
    .single();

  if (error) throw error;

  if (!data) return null;

  return {
    showName: data.show_name || 'Competition',
    organization: data.organization || ''
  };
}

/**
 * Fetch classes with visibility presets
 */
async function fetchClasses(licenseKey: string): Promise<ClassInfo[]> {
  // Use view_class_summary for richer data with pre-aggregated counts
  const { data, error } = await supabase
    .from('view_class_summary')
    .select('*')
    .eq('license_key', licenseKey)
    .order('element', { ascending: true });

  if (error) throw error;

  // Fetch visibility overrides for all classes
  const rawData = (data || []) as RawClassSummaryData[];
  const classIds = rawData.map((classData) => classData.class_id);
  const { data: visibilityData } = await supabase
    .from('class_result_visibility_overrides')
    .select('class_id, preset_name')
    .in('class_id', classIds);

  // Create map of class_id to preset_name
  // CRITICAL: Use string keys for consistency (prevents number/string type mismatch bugs)
  const visibilityMap = new Map<string, VisibilityPreset>();
  ((visibilityData || []) as RawVisibilityOverride[]).forEach((override) => {
    visibilityMap.set(String(override.class_id), override.preset_name);
  });

  // Map view columns to ClassInfo interface
  const classes = rawData.map((classData) => ({
    id: classData.class_id,
    trial_id: classData.trial_id,
    element: classData.element,
    level: classData.level,
    section: classData.section,
    judge_name: classData.judge_name,
    trial_date: classData.trial_date || '',
    trial_number: classData.trial_number?.toString() || '',
    class_completed: classData.is_scoring_finalized || false,
    results_released_at: null,
    results_released_by: null,
    class_completed_at: null,
    self_checkin: classData.self_checkin_enabled || false,
    total_entries: classData.total_entries || 0,
    scored_entries: classData.scored_entries || 0,
    visibility_preset: visibilityMap.get(String(classData.class_id)) || 'standard'
  }));

  return classes;
}

/**
 * Derive trial information from classes
 */
function deriveTrialsFromClasses(classes: ClassInfo[]): TrialInfo[] {
  const trialsMap = new Map<number, {
    trial_id: number;
    trial_date: string;
    trial_number: number;
    judges: Set<string>;
    class_count: number;
  }>();

  classes.forEach((classData: ClassInfo) => {
    if (!trialsMap.has(classData.trial_id)) {
      trialsMap.set(classData.trial_id, {
        trial_id: classData.trial_id,
        trial_date: classData.trial_date,
        trial_number: parseInt(classData.trial_number) || 0,
        judges: new Set([classData.judge_name]),
        class_count: 1
      });
    } else {
      const trial = trialsMap.get(classData.trial_id)!;
      trial.judges.add(classData.judge_name);
      trial.class_count++;
    }
  });

  return Array.from(trialsMap.values())
    .map(trial => ({
      ...trial,
      judges: Array.from(trial.judges).sort()
    }))
    .sort((a, b) => {
      if (a.trial_date !== b.trial_date) {
        return a.trial_date.localeCompare(b.trial_date);
      }
      return a.trial_number - b.trial_number;
    });
}

// ============================================================
// CUSTOM HOOKS
// ============================================================

/**
 * Hook to fetch show information
 */
export function useShowInfo(licenseKey: string | undefined) {
  return useQuery({
    queryKey: competitionAdminKeys.showInfo(licenseKey || ''),
    queryFn: () => fetchShowInfo(licenseKey || 'myK9Q1-d8609f3b-d3fd43aa-6323a604'),
    enabled: !!licenseKey, // Only run if licenseKey is provided
    staleTime: 10 * 60 * 1000, // 10 minutes (show info rarely changes)
  });
}

/**
 * Hook to fetch classes
 */
export function useClasses(licenseKey: string | undefined) {
  return useQuery({
    queryKey: competitionAdminKeys.classes(licenseKey || ''),
    queryFn: () => fetchClasses(licenseKey || 'myK9Q1-d8609f3b-d3fd43aa-6323a604'),
    enabled: !!licenseKey,
    staleTime: 2 * 60 * 1000, // 2 minutes (classes change more frequently)
    select: (data) => {
      // Sort classes by trial date, trial number, element, level, section
      return data.sort((a, b) => {
        if (a.trial_date !== b.trial_date) {
          return a.trial_date.localeCompare(b.trial_date);
        }
        const trialNumA = parseInt(a.trial_number) || 0;
        const trialNumB = parseInt(b.trial_number) || 0;
        if (trialNumA !== trialNumB) {
          return trialNumA - trialNumB;
        }
        if (a.element !== b.element) {
          return a.element.localeCompare(b.element);
        }
        // Use getLevelSortOrder for proper level sorting
        // For now, simple string comparison (can improve later)
        if (a.level !== b.level) {
          return a.level.localeCompare(b.level);
        }
        return a.section.localeCompare(b.section);
      });
    },
  });
}

/**
 * Hook to get trials (derived from classes)
 */
export function useTrials(licenseKey: string | undefined) {
  const { data: classes = [] } = useClasses(licenseKey);
  return deriveTrialsFromClasses(classes);
}

/**
 * Mutation hook for bulk self check-in updates
 */
export function useBulkSelfCheckinMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ classIds, enabled }: { classIds: number[]; enabled: boolean }) => {
      const updates = classIds.map(classId =>
        supabase
          .from('classes')
          .update({ self_checkin_enabled: enabled })
          .eq('id', classId)
      );

      await Promise.all(updates);
    },
    onSuccess: () => {
      // Invalidate classes query to refetch data
      // This will automatically update the UI with new data
      queryClient.invalidateQueries({
        queryKey: ['competitionAdmin'],
      });
    },
  });
}

/**
 * Helper hook that combines all data fetching
 */
export function useCompetitionAdminData(licenseKey: string | undefined) {
  const showInfoQuery = useShowInfo(licenseKey);
  const classesQuery = useClasses(licenseKey);
  const trials = useTrials(licenseKey);

  // Track online/offline status for graceful degradation
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    showInfo: showInfoQuery.data,
    classes: classesQuery.data || [],
    trials,
    isLoading: showInfoQuery.isLoading || classesQuery.isLoading,
    isOffline,
    error: showInfoQuery.error || classesQuery.error,
    refetch: () => {
      showInfoQuery.refetch();
      classesQuery.refetch();
    },
  };
}

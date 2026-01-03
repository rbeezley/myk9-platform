// src/pages/Results/hooks/useResultsData.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import type { UserRole } from '../../../utils/auth';
import { logger } from '@/utils/logger';

export interface ResultsFilters {
  trial: number | null;
  element: string | null;
  level: string | null;
}

export interface TrialOption {
  id: number;
  name: string;
  date: string;
}

export interface CompletedClassResult {
  classId: number;
  className: string;
  element: string;
  level: string;
  section?: string;
  trialId: number;
  trialName?: string;
  placements: {
    placement: 1 | 2 | 3 | 4;
    handlerName: string;
    dogName: string;
    breed: string;
    armband: number;
  }[];
}

export interface UseResultsDataParams {
  trialId?: number;
  showId?: string | number;
  userRole?: UserRole; // Reserved for future visibility filtering
}

export interface PendingClassInfo {
  classId: number;
  className: string;
  element: string;
  level: string;
  section?: string;
}

export interface UseResultsDataReturn {
  completedClasses: CompletedClassResult[];
  pendingClasses: PendingClassInfo[];
  trials: TrialOption[];
  isLoading: boolean;
  error: Error | null;
  filters: ResultsFilters;
  setFilters: (filters: ResultsFilters) => void;
  refetch: () => void;
}

export function useResultsData({
  trialId: initialTrialId,
  showId,
  userRole: _userRole = 'exhibitor', // Reserved for future visibility filtering
}: UseResultsDataParams): UseResultsDataReturn {
  const [completedClasses, setCompletedClasses] = useState<CompletedClassResult[]>([]);
  const [trials, setTrials] = useState<TrialOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [filters, setFilters] = useState<ResultsFilters>({
    trial: initialTrialId || null,
    element: null,
    level: null,
  });

  // Fetch available trials for this show
  const fetchTrials = useCallback(async () => {
    if (!showId) return;

    try {
      const numericShowId = typeof showId === 'string' ? parseInt(showId, 10) : showId;

      const { data: trialsData, error: trialsError } = await supabase
        .from('trials')
        .select('id, trial_name, trial_date, trial_number')
        .eq('show_id', numericShowId)
        .order('trial_date')
        .order('trial_number');

      if (trialsError) throw trialsError;

      const trialOptions: TrialOption[] = (trialsData || []).map((t) => ({
        id: t.id,
        name: t.trial_name || `Trial ${t.trial_number}`,
        date: t.trial_date,
      }));

      setTrials(trialOptions);
    } catch (err) {
      logger.error('Error fetching trials:', err);
    }
  }, [showId]);

  const fetchResults = useCallback(async () => {
    if (!showId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use view_class_summary - the recommended view for class queries
      let query = supabase
        .from('view_class_summary')
        .select('*')
        .eq('is_scoring_finalized', true)
        .order('element')
        .order('level');

      // Filter by trial if specified, otherwise by show
      if (filters.trial) {
        query = query.eq('trial_id', filters.trial);
      } else {
        // Convert showId to number - view_class_summary.show_id is bigint
        const numericShowId = typeof showId === 'string' ? parseInt(showId, 10) : showId;
        query = query.eq('show_id', numericShowId);
      }

      const { data: classes, error: classError } = await query;

      if (classError) throw classError;
      if (!classes || classes.length === 0) {
        setCompletedClasses([]);
        setIsLoading(false);
        return;
      }

      // Fetch placements for each completed class
      const classResults: CompletedClassResult[] = [];

      for (const cls of classes) {
        // Fetch top 4 placements for this class
        // Using view_entry_with_results which has placement data
        // Column names: final_placement, handler_name, dog_call_name, dog_breed, armband_number
        const { data: entries, error: entryError } = await supabase
          .from('view_entry_with_results')
          .select('*')
          .eq('class_id', cls.class_id)
          .gte('final_placement', 1)
          .lte('final_placement', 4)
          .order('final_placement');

        if (entryError) continue; // Skip classes with entry fetch errors

        // Build class name, excluding section if it's just "-" or empty
        const hasValidSection = cls.section && cls.section.trim() !== '-' && cls.section.trim() !== '';
        const className = hasValidSection
          ? `${cls.element} ${cls.level} ${cls.section}`
          : `${cls.element} ${cls.level}`;

        classResults.push({
          classId: cls.class_id,
          className,
          element: cls.element,
          level: cls.level,
          section: cls.section,
          trialId: cls.trial_id,
          trialName: cls.trial_name,
          placements: (entries || []).map((e) => ({
            placement: e.final_placement as 1 | 2 | 3 | 4,
            handlerName: e.handler_name,
            dogName: e.dog_call_name,
            breed: e.dog_breed,
            armband: e.armband_number,
          })),
        });
      }

      setCompletedClasses(classResults);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch results'));
    } finally {
      setIsLoading(false);
    }
  }, [filters.trial, showId]);

  // Fetch trials on mount
  useEffect(() => {
    fetchTrials();
  }, [fetchTrials]);

  // Fetch results when filters change
  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // Apply client-side filters (element/level)
  const filteredClasses = completedClasses.filter((cls) => {
    if (filters.element && cls.element !== filters.element) return false;
    if (filters.level && cls.level !== filters.level) return false;
    return true;
  });

  // Separate classes with placements from those without (pending)
  const classesWithPlacements = filteredClasses.filter((cls) => cls.placements.length > 0);
  const pendingClasses: PendingClassInfo[] = filteredClasses
    .filter((cls) => cls.placements.length === 0)
    .map((cls) => ({
      classId: cls.classId,
      className: cls.className,
      element: cls.element,
      level: cls.level,
      section: cls.section,
    }));

  return {
    completedClasses: classesWithPlacements,
    pendingClasses,
    trials,
    isLoading,
    error,
    filters,
    setFilters,
    refetch: fetchResults,
  };
}

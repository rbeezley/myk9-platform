/**
 * Hook for fetching class availability for a show
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';

export interface ClassAvailability {
  classId: string;
  className: string;
  level: string;
  trialId: string;
  trialName: string;
  trialDate: string;
  entryLimit: number;
  currentEntries: number;
  spotsAvailable: number;
  waitlistCount: number;
  isFull: boolean;
  hasWaitlist: boolean;
}

interface UseClassAvailabilityOptions {
  enabled?: boolean;
}

interface UseClassAvailabilityResult {
  classes: ClassAvailability[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  totalSpotsAvailable: number;
  fullClasses: number;
}

export function useClassAvailability(
  showId: string | undefined,
  options: UseClassAvailabilityOptions = {}
): UseClassAvailabilityResult {
  const { enabled = true } = options;

  const [classes, setClasses] = useState<ClassAvailability[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClassAvailability = useCallback(async () => {
    if (!showId || !enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch classes for this show with their entry counts
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select(`
          id,
          name,
          level,
          max_entries,
          trial_id,
          trials!inner (
            id,
            name,
            date,
            show_id
          )
        `)
        .eq('trials.show_id', showId)
        .order('level');

      if (classError) {
        logger.error('Error fetching classes', 'useClassAvailability', { showId }, classError as Error);
        throw classError;
      }

      if (!classData || classData.length === 0) {
        setClasses([]);
        return;
      }

      // Get entry counts for each class
      const classIds = classData.map((c: { id: string }) => c.id);
      const { data: entryCounts, error: countError } = await supabase
        .from('entries')
        .select('class_id')
        .in('class_id', classIds)
        .in('status', ['pending', 'confirmed', 'paid', 'checked_in']);

      if (countError) {
        logger.warn('Error fetching entry counts', 'useClassAvailability', {}, countError as Error);
      }

      // Count entries per class
      const entryCountMap = (entryCounts || []).reduce((acc: Record<string, number>, entry: { class_id: string | null }) => {
        if (entry.class_id) {
          acc[entry.class_id] = (acc[entry.class_id] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);

      // Get waitlist counts (from migration 009 - may not exist yet)
      let waitlistCountMap: Record<string, number> = {};
      try {
        const { data: waitlistCounts, error: waitlistError } = await supabase
          .from('waitlist_entries')
          .select('class_id')
          .in('class_id', classIds)
          .eq('status', 'waiting');

        if (!waitlistError && waitlistCounts) {
          waitlistCountMap = waitlistCounts.reduce((acc: Record<string, number>, entry: { class_id: string | null }) => {
            if (entry.class_id) {
              acc[entry.class_id] = (acc[entry.class_id] || 0) + 1;
            }
            return acc;
          }, {} as Record<string, number>);
        }
      } catch {
        // Waitlist table may not exist yet - that's OK
        logger.debug('Waitlist table not available yet', 'useClassAvailability', {});
      }

      // Transform to ClassAvailability format
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const availability: ClassAvailability[] = classData.map((cls: any) => {
        const trial = cls.trials as { id: string; name: string; date: string; show_id: string };
        const currentEntries = entryCountMap[cls.id] || 0;
        const entryLimit = cls.max_entries || 0;
        const spotsAvailable = Math.max(0, entryLimit - currentEntries);
        const waitlistCount = waitlistCountMap[cls.id] || 0;

        return {
          classId: cls.id,
          className: cls.name,
          level: cls.level || 'Open',
          trialId: trial.id,
          trialName: trial.name,
          trialDate: trial.date,
          entryLimit,
          currentEntries,
          spotsAvailable,
          waitlistCount,
          isFull: entryLimit > 0 && currentEntries >= entryLimit,
          hasWaitlist: waitlistCount > 0,
        };
      });

      setClasses(availability);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch class availability';
      setError(message);
      logger.error('Failed to fetch class availability', 'useClassAvailability', { showId }, err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [showId, enabled]);

  useEffect(() => {
    fetchClassAvailability();
  }, [fetchClassAvailability]);

  // Computed values
  const totalSpotsAvailable = classes.reduce((sum, cls) => sum + cls.spotsAvailable, 0);
  const fullClasses = classes.filter(cls => cls.isFull).length;

  return {
    classes,
    isLoading,
    error,
    refetch: fetchClassAvailability,
    totalSpotsAvailable,
    fullClasses,
  };
}

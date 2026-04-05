/**
 * Hook for fetching class availability for a show.
 * Uses judge-day capacity model: fullness is determined by the assigned
 * judge's total entries for that date, not per-class max_entries.
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
  // Judge-day capacity fields
  judgeId: string | null;
  judgeDayFull: boolean;
  judgeDayAvailable: number;
}

interface UseClassAvailabilityOptions {
  enabled?: boolean;
}

interface ClassWithTrialRow {
  id: string;
  name: string;
  level: string | null;
  max_entries: number | null;
  trial_id: string;
  trials: {
    id: string;
    name: string;
    date: string;
    show_id: string;
  };
}

interface JudgeAssignmentRow {
  class_id: string;
  person_id: string;
  trials: {
    date: string;
  };
}

// These columns are added by migration 114; cast until types are regenerated.
interface ShowCapacityRow {
  default_judge_day_capacity: number;
  mail_in_strategy: string | null;
  mail_in_value: number | null;
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
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select(
          `
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
        `
        )
        .eq('trials.show_id', showId)
        .order('level');

      if (classError) {
        logger.error(
          'Error fetching classes',
          'useClassAvailability',
          { showId },
          classError as Error
        );
        throw new Error((classError as { message?: string }).message ?? String(classError));
      }

      if (!classData || classData.length === 0) {
        setClasses([]);
        return;
      }

      const classIds = classData.map((c: { id: string }) => c.id);

      const [showResult, entryResult, waitlistResult, judgeResult] = await Promise.all([
        supabase
          .from('shows')
          .select('default_judge_day_capacity, mail_in_strategy, mail_in_value')
          .eq('id', showId)
          .single(),
        supabase
          .from('entries')
          .select('class_id')
          .in('class_id', classIds)
          .in('entry_status', [
            'submitted',
            'paid',
            'confirmed',
            'checked-in',
            'competing',
            'pending-payment',
          ]),
        supabase
          .from('waitlist_entries')
          .select('class_id')
          .in('class_id', classIds)
          .eq('status', 'waiting'),
        supabase
          .from('judge_assignments')
          .select('class_id, person_id, trials!inner(date)')
          .eq('show_id', showId)
          .eq('status', 'confirmed'),
      ]);

      if (showResult.error) throw showResult.error;

      const show = showResult.data as unknown as ShowCapacityRow;
      const defaultCapacity = show?.default_judge_day_capacity ?? 125;

      const entryCountMap: Record<string, number> = {};
      for (const entry of entryResult.data ?? []) {
        if (entry.class_id) {
          entryCountMap[entry.class_id] = (entryCountMap[entry.class_id] ?? 0) + 1;
        }
      }

      const waitlistCountMap: Record<string, number> = {};
      for (const entry of waitlistResult.data ?? []) {
        if (entry.class_id) {
          waitlistCountMap[entry.class_id] = (waitlistCountMap[entry.class_id] ?? 0) + 1;
        }
      }

      const classJudgeMap: Record<string, string> = {};
      // Composite key `${judgeId}:${date}` → total confirmed entries for that judge-day
      const judgeDayEntryCount: Record<string, number> = {};

      for (const ja of (judgeResult.data as JudgeAssignmentRow[]) ?? []) {
        classJudgeMap[ja.class_id] = ja.person_id;
        const date = ja.trials?.date;
        if (date) {
          const key = `${ja.person_id}:${date}`;
          const count = entryCountMap[ja.class_id] ?? 0;
          judgeDayEntryCount[key] = (judgeDayEntryCount[key] ?? 0) + count;
        }
      }

      let mailInReserved = 0;
      if (show?.mail_in_strategy === 'fixed') {
        mailInReserved = show.mail_in_value ?? 0;
      } else if (show?.mail_in_strategy === 'percentage') {
        mailInReserved = Math.floor((defaultCapacity * (show.mail_in_value ?? 0)) / 100);
      }

      const availability: ClassAvailability[] = (classData as ClassWithTrialRow[]).map(cls => {
        const trial = cls.trials;
        const currentEntries = entryCountMap[cls.id] ?? 0;
        const entryLimit = cls.max_entries ?? 0;
        const waitlistCount = waitlistCountMap[cls.id] ?? 0;

        const judgeId = classJudgeMap[cls.id] ?? null;
        let judgeDayFull = false;
        let judgeDayAvailable = defaultCapacity - mailInReserved;

        if (judgeId) {
          const key = `${judgeId}:${trial.date}`;
          const judgeDayConfirmed = judgeDayEntryCount[key] ?? 0;
          judgeDayAvailable = Math.max(0, defaultCapacity - judgeDayConfirmed - mailInReserved);
          judgeDayFull = judgeDayAvailable === 0;
        }

        const perClassFull = entryLimit > 0 && currentEntries >= entryLimit;
        const spotsAvailable = judgeId
          ? judgeDayAvailable
          : Math.max(0, entryLimit - currentEntries);

        return {
          classId: cls.id,
          className: cls.name,
          level: cls.level ?? 'Open',
          trialId: trial.id,
          trialName: trial.name,
          trialDate: trial.date,
          entryLimit,
          currentEntries,
          spotsAvailable,
          waitlistCount,
          isFull: judgeDayFull || perClassFull,
          hasWaitlist: waitlistCount > 0,
          judgeId,
          judgeDayFull,
          judgeDayAvailable,
        };
      });

      setClasses(availability);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch class availability';
      setError(message);
      logger.error(
        'Failed to fetch class availability',
        'useClassAvailability',
        { showId },
        err as Error
      );
    } finally {
      setIsLoading(false);
    }
  }, [showId, enabled]);

  useEffect(() => {
    fetchClassAvailability();
  }, [fetchClassAvailability]);

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

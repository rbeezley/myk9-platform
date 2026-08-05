/**
 * Hook for fetching class availability for a show.
 * Uses the same combined fullness inputs as server-side entry submission:
 * assigned judge-day capacity and the class's own max_entries limit.
 */

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import { IN_RING_STATUSES } from '@/types/entry-lifecycle';
import { calculateMailInReserved } from '@/utils/waitlistCapacity';

export interface ClassAvailability {
  classId: string;
  className: string;
  element: string | null;
  level: string;
  section: string | null;
  trialId: string;
  trialName: string;
  trialDate: string;
  entryLimit: number;
  currentEntries: number;
  spotsAvailable: number;
  waitlistCount: number;
  isFull: boolean;
  hasWaitlist: boolean;
  allowsWaitlist: boolean;
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
  element: string | null;
  level: string | null;
  section: string | null;
  max_entries: number | null;
  allow_waitlist: boolean | null;
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
  day_capacity_override: number | null;
  trials: {
    date: string;
  };
}

// These columns are added by migration 114; cast until types are regenerated.
interface ShowCapacityRow {
  default_judge_day_capacity: number;
  mail_in_strategy: string | null;
  mail_in_value: number | null;
  mail_in_auto_release: boolean | null;
  mail_in_release_date: string | null;
}

interface UseClassAvailabilityResult {
  classes: ClassAvailability[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  totalSpotsAvailable: number;
  fullClasses: number;
}

export const classAvailabilityQueryKey = (showId: string | undefined) =>
  ['shows', showId, 'class-availability'] as const;

export function useClassAvailability(
  showId: string | undefined,
  options: UseClassAvailabilityOptions = {}
): UseClassAvailabilityResult {
  const { enabled = true } = options;

  const fetchClassAvailability = useCallback(async (): Promise<ClassAvailability[]> => {
    if (!showId) return [];

    try {
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select(
          `
          id,
          name,
          element,
          level,
          section,
          max_entries,
          allow_waitlist,
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
        return [];
      }

      const classIds = classData.map((c: { id: string }) => c.id);

      const [showResult, entryResult, waitlistResult, judgeResult] = await Promise.all([
        supabase
          .from('shows')
          .select(
            'default_judge_day_capacity, mail_in_strategy, mail_in_value, mail_in_auto_release, mail_in_release_date'
          )
          .eq('id', showId)
          .single(),
        supabase
          .from('entries')
          .select('class_id')
          .in('class_id', classIds)
          .is('deleted_at', null)
          .in('entry_status', [
            'submitted',
            'paid',
            'confirmed',
            'checked-in',
            ...IN_RING_STATUSES,
            'pending-payment',
          ]),
        supabase
          .from('waitlist_entries')
          .select('class_id')
          .in('class_id', classIds)
          .eq('status', 'waiting'),
        supabase
          .from('judge_assignments')
          .select('class_id, person_id, day_capacity_override, trials!inner(date)')
          .eq('show_id', showId)
          .eq('status', 'confirmed'),
      ]);

      const relatedQueryError =
        showResult.error ?? entryResult.error ?? waitlistResult.error ?? judgeResult.error;
      if (relatedQueryError) {
        logger.error(
          'Error fetching class availability counts',
          'useClassAvailability',
          { showId },
          relatedQueryError as Error
        );
        throw new Error(
          (relatedQueryError as { message?: string }).message ?? String(relatedQueryError)
        );
      }

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
      // Composite key `${judgeId}:${date}` → max day_capacity_override for that judge-day
      const judgeDayCapacityOverride: Record<string, number> = {};

      for (const ja of (judgeResult.data as unknown as JudgeAssignmentRow[]) ?? []) {
        classJudgeMap[ja.class_id] = ja.person_id;
        const date = ja.trials?.date;
        if (date) {
          const key = `${ja.person_id}:${date}`;
          const count = entryCountMap[ja.class_id] ?? 0;
          judgeDayEntryCount[key] = (judgeDayEntryCount[key] ?? 0) + count;
          if (ja.day_capacity_override != null) {
            judgeDayCapacityOverride[key] = Math.max(
              judgeDayCapacityOverride[key] ?? 0,
              ja.day_capacity_override
            );
          }
        }
      }

      const defaultMailInReserved = calculateMailInReserved({
        capacity: defaultCapacity,
        strategy: show?.mail_in_strategy ?? null,
        value: show?.mail_in_value ?? null,
        autoRelease: show?.mail_in_auto_release ?? null,
        releaseDate: show?.mail_in_release_date ?? null,
      });

      const availability: ClassAvailability[] = (classData as ClassWithTrialRow[]).map(cls => {
        const trial = cls.trials;
        const currentEntries = entryCountMap[cls.id] ?? 0;
        const entryLimit = cls.max_entries ?? 0;
        const waitlistCount = waitlistCountMap[cls.id] ?? 0;
        const allowsWaitlist = cls.allow_waitlist ?? false;

        const judgeId = classJudgeMap[cls.id] ?? null;
        let judgeDayFull = false;
        let judgeDayAvailable = defaultCapacity - defaultMailInReserved;

        if (judgeId) {
          const key = `${judgeId}:${trial.date}`;
          const judgeDayConfirmed = judgeDayEntryCount[key] ?? 0;
          const effectiveCapacity = judgeDayCapacityOverride[key] ?? defaultCapacity;
          const judgeDayMailInReserved = calculateMailInReserved({
            capacity: effectiveCapacity,
            strategy: show?.mail_in_strategy ?? null,
            value: show?.mail_in_value ?? null,
            autoRelease: show?.mail_in_auto_release ?? null,
            releaseDate: show?.mail_in_release_date ?? null,
          });
          judgeDayAvailable = Math.max(
            0,
            effectiveCapacity - judgeDayConfirmed - judgeDayMailInReserved
          );
          judgeDayFull = judgeDayAvailable === 0;
        }

        const perClassFull = entryLimit > 0 && currentEntries >= entryLimit;
        const spotsAvailable = perClassFull
          ? 0
          : judgeId
            ? judgeDayAvailable
            : Math.max(0, entryLimit - currentEntries);

        return {
          classId: cls.id,
          className: cls.name,
          element: cls.element,
          level: cls.level ?? 'Open',
          section: cls.section,
          trialId: trial.id,
          trialName: trial.name,
          trialDate: trial.date,
          entryLimit,
          currentEntries,
          spotsAvailable,
          waitlistCount,
          isFull: judgeDayFull || perClassFull,
          hasWaitlist: waitlistCount > 0,
          allowsWaitlist,
          judgeId,
          judgeDayFull,
          judgeDayAvailable,
        };
      });

      return availability;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch class availability';
      logger.error(
        'Failed to fetch class availability',
        'useClassAvailability',
        { showId },
        err as Error
      );
      throw new Error(message);
    }
  }, [showId]);

  const query = useQuery({
    queryKey: classAvailabilityQueryKey(showId),
    queryFn: fetchClassAvailability,
    enabled: Boolean(showId && enabled),
  });

  const classes = showId && enabled ? (query.data ?? []) : [];
  const isLoading = Boolean(showId && enabled && (query.isLoading || query.isFetching));
  const error = query.error instanceof Error ? query.error.message : null;
  const queryRefetch = query.refetch;

  const refetch = useCallback(async () => {
    await queryRefetch();
  }, [queryRefetch]);

  const totalSpotsAvailable = classes.reduce((sum, cls) => sum + cls.spotsAvailable, 0);
  const fullClasses = classes.filter(cls => cls.isFull).length;

  return {
    classes,
    isLoading,
    error,
    refetch,
    totalSpotsAvailable,
    fullClasses,
  };
}

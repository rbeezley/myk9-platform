/**
 * Hook for fetching class availability for a show.
 *
 * Every capacity fact comes from `get_show_class_availability`, a SECURITY
 * DEFINER read that counts every entry in the class, not the rows the caller's
 * RLS returns (MYK9-705). It applies the same rule the entry submit enforces:
 * `evaluate_entry_capacity`'s class count and `get_judge_day_capacity_live`'s
 * self-service judge-day figure (migration 20260925004700). Counts and flags
 * only; no other exhibitor's rows reach the client.
 */

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';

export interface ClassAvailability {
  classId: string;
  className: string;
  element: string | null;
  level: string;
  section: string | null;
  /**
   * `classes.status` as stored ('upcoming' | 'setup' | 'in_progress' |
   * 'completed' | 'cancelled'). The registration wizard refuses a class the
   * judge has already started (MYK9-516); read it through
   * `getClassEntryWindow`, never by comparing the raw string.
   */
  status: string | null;
  /**
   * True when this class is actually RUNNING or has run, whatever `status` says.
   *
   * `classes.status` only flips to 'in_progress' once the first score lands
   * (`refresh_class_scoring_state`), so between "dogs are in the ring" and
   * "somebody scored one" the column still reads 'upcoming'. Ringside never
   * trusts the column alone either — `getEffectiveClassStatus` derives the same
   * thing from `is_in_ring` / scoring state — and neither may the wizard, or the
   * guard is open for exactly the window it exists to close (MYK9-516).
   *
   * Computed by the server over EVERY entry in the class, with the predicate
   * `submit_show_entries` refuses a started class on (`is_in_ring` or
   * `is_scored`), so another exhibitor's dog in the ring counts.
   */
  hasStarted: boolean;
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
  /** Self-service spots left on the tightest judge day; 0 when no judge is assigned. */
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
  status: string | null;
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

interface UseClassAvailabilityResult {
  classes: ClassAvailability[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  totalSpotsAvailable: number;
  fullClasses: number;
}

/**
 * Said when the server returned no counts for a class the caller can see. A
 * missing count is never read as "open": that is the MYK9-705 failure again.
 */
export const CLASS_AVAILABILITY_UNREADABLE =
  'Class availability could not be read for this show. Please try again.';

export const classAvailabilityQueryKey = (showId: string | undefined) =>
  ['shows', showId, 'class-availability'] as const;

function errorMessage(error: unknown): string {
  return (error as { message?: string }).message ?? String(error);
}

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
          status,
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
        throw new Error(errorMessage(classError));
      }

      if (!classData || classData.length === 0) {
        return [];
      }

      const { data: countRows, error: countError } = await supabase.rpc(
        'get_show_class_availability',
        { p_show_id: showId }
      );

      if (countError) {
        logger.error(
          'Error fetching class availability counts',
          'useClassAvailability',
          { showId },
          countError as Error
        );
        throw new Error(errorMessage(countError));
      }

      const countsByClass = new Map((countRows ?? []).map(count => [count.class_id, count]));

      return (classData as ClassWithTrialRow[]).map(cls => {
        const counts = countsByClass.get(cls.id);
        if (!counts) {
          logger.error('No availability counts for a visible class', 'useClassAvailability', {
            showId,
            classId: cls.id,
          });
          throw new Error(CLASS_AVAILABILITY_UNREADABLE);
        }

        const trial = cls.trials;
        const entryLimit = cls.max_entries ?? 0;
        const judgeId = counts.judge_id;
        const judgeDayAvailable = counts.judge_day_available ?? 0;
        const spotsAvailable = counts.class_full
          ? 0
          : judgeId
            ? judgeDayAvailable
            : Math.max(0, entryLimit - counts.entry_count);

        return {
          classId: cls.id,
          className: cls.name,
          element: cls.element,
          level: cls.level ?? 'Open',
          section: cls.section,
          status: cls.status,
          hasStarted: counts.has_started,
          trialId: trial.id,
          trialName: trial.name,
          trialDate: trial.date,
          entryLimit,
          currentEntries: counts.entry_count,
          spotsAvailable,
          waitlistCount: counts.waitlist_count,
          isFull: counts.class_full || counts.judge_day_full,
          hasWaitlist: counts.waitlist_count > 0,
          allowsWaitlist: counts.allow_waitlist,
          judgeId,
          judgeDayFull: counts.judge_day_full,
          judgeDayAvailable,
        };
      });
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

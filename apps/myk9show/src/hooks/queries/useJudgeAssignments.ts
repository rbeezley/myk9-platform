import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase as supabaseClient } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import { queryKeys } from '@/lib/queryClient';
import type { JudgeClass } from '@/pages/judgeStatsUtils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;

/** Raw row shape from the judge_assignments → classes → trials join. */
export interface JudgeAssignmentRow {
  id: string;
  class_id: string | null;
  show_id: string | null;
  status: string | null;
  classes: {
    id: string;
    name: string;
    element: string | null;
    level: string | null;
    status: string | null;
    start_time: string | null;
    total_entries_count: number | null;
    scored_count: number | null;
    trial_id: string;
    trials: { id: string; date: string; show_id: string } | null;
  } | null;
}

/**
 * classes.start_time is a Postgres TIME ("HH:MM:SS"); combine it with the
 * trial date so the dashboard can sort classes and show a clock time.
 * Tolerates a full ISO timestamp in case the column shape ever changes.
 */
export function parseScheduledTime(trialDate: string, startTime: string | null): Date {
  if (startTime?.includes('T')) return new Date(startTime);
  if (startTime && /^\d{1,2}:\d{2}/.test(startTime)) return new Date(`${trialDate}T${startTime}`);
  return new Date(`${trialDate}T00:00:00`);
}

function toDashboardStatus(classStatus: string | null): JudgeClass['status'] {
  if (classStatus === 'completed') return 'completed';
  if (classStatus === 'in_progress') return 'in-progress';
  return 'pending'; // upcoming / setup / null
}

/** Returns null for rows that can't be judged: no class/trial attached, or class cancelled. */
export function mapAssignmentRowToJudgeClass(row: JudgeAssignmentRow): JudgeClass | null {
  const cls = row.classes;
  const trial = cls?.trials;
  if (!cls || !trial) return null;
  if (cls.status === 'cancelled') return null;

  return {
    id: row.id,
    showId: row.show_id ?? trial.show_id,
    trialId: cls.trial_id,
    classId: row.class_id ?? cls.id,
    name: cls.name,
    element: cls.element ?? '',
    level: cls.level ?? '',
    trialDate: trial.date,
    scheduledTime: parseScheduledTime(trial.date, cls.start_time),
    ringNumber: null,
    totalEntries: cls.total_entries_count ?? 0,
    completedEntries: cls.scored_count ?? 0,
    status: toDashboardStatus(cls.status),
  };
}

export interface JudgeAssignmentsResult {
  assignments: JudgeClass[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}

/** All confirmed/invited class assignments for the signed-in judge, sorted by scheduled time. */
export function useJudgeAssignments(): JudgeAssignmentsResult {
  const { userWithRoles } = useAuthContext();
  const personId = userWithRoles?.databaseUserId ?? '';

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: queryKeys.judges.assignments(personId),
    enabled: !!personId,
    // Class status changes while the judge is in the ring; refresh on every
    // return to the dashboard so "Continue Judging" doesn't go stale.
    refetchOnMount: 'always',
    queryFn: async (): Promise<JudgeAssignmentRow[]> => {
      const { data: rows, error } = await supabase
        .from('judge_assignments')
        .select(
          `
          id,
          class_id,
          show_id,
          status,
          classes (
            id,
            name,
            element,
            level,
            status,
            start_time,
            total_entries_count,
            scored_count,
            trial_id,
            trials (
              id,
              date,
              show_id
            )
          )
        `
        )
        .eq('person_id', personId)
        .in('status', ['confirmed', 'invited']);

      if (error) throw error;
      return rows ?? [];
    },
  });

  const assignments = useMemo(
    () =>
      (data ?? [])
        .map(mapAssignmentRowToJudgeClass)
        .filter((c): c is JudgeClass => c !== null)
        .sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime()),
    [data]
  );

  // databaseUserId resolves asynchronously after sign-in; while it is missing
  // the query is disabled and React Query reports isLoading=false, which would
  // flash "no assignments" at the judge. Treat unresolved identity as loading.
  return { assignments, isLoading: isLoading || !personId, isFetching, isError, refetch };
}

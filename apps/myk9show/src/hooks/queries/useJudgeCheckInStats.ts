import { useQuery } from '@tanstack/react-query';
import { supabase as supabaseClient } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import { queryKeys } from '@/lib/queryClient';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;

export interface JudgeRingAssignment {
  classId: string;
  className: string;
  totalEntries: number;
  checkedIn: number;
  conflicts: number;
}

export interface JudgeCheckInStatsResult {
  rings: JudgeRingAssignment[];
  isLoading: boolean;
  error: string | null;
}

export function useJudgeCheckInStats(): JudgeCheckInStatsResult {
  const { userWithRoles } = useAuthContext();
  const personId = userWithRoles?.databaseUserId ?? '';

  const today = new Date().toISOString().slice(0, 10);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.judges.upcoming(personId),
    enabled: !!personId,
    queryFn: async () => {
      const { data: rows, error: queryError } = await supabase
        .from('judge_assignments')
        .select(
          `
          id,
          class_id,
          status,
          classes (
            id,
            name,
            total_entries_count,
            checked_in_count,
            trials (
              id,
              date
            )
          )
        `
        )
        .eq('person_id', personId)
        .in('status', ['confirmed', 'invited']);

      if (queryError) throw queryError;

      type Row = {
        id: string;
        class_id: string;
        status: string;
        classes: {
          id: string;
          name: string;
          total_entries_count: number;
          checked_in_count: number;
          trials: { id: string; date: string } | null;
        } | null;
      };

      const allRows: Row[] = rows ?? [];

      // Filter to today's trials only
      const todayRows = allRows.filter(r => r.classes?.trials?.date === today);

      const rings: JudgeRingAssignment[] = todayRows
        .filter(r => r.classes != null)
        .map(r => {
          const cls = r.classes!;
          const total = cls.total_entries_count ?? 0;
          const checkedIn = cls.checked_in_count ?? 0;
          // Conflicts = entries not yet checked in (past start, not checked in)
          // Without a separate conflicts table we approximate as 0; a real impl
          // would join a conflicts view. Keep at 0 so we never show fake data.
          return {
            classId: cls.id,
            className: cls.name,
            totalEntries: total,
            checkedIn,
            conflicts: 0,
          };
        });

      return rings;
    },
  });

  return {
    rings: data ?? [],
    isLoading,
    error: error ? (error as Error).message : null,
  };
}

import { useQuery } from '@tanstack/react-query';
import { supabase as supabaseClient } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import { queryKeys } from '@/lib/queryClient';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;

export interface JudgeTodayStats {
  totalToday: number;
  completedToday: number;
  totalEntries: number;
  checkedInCount: number;
  nextClass: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useJudgeTodayStats(): JudgeTodayStats {
  const { userWithRoles } = useAuthContext();
  const personId = userWithRoles?.databaseUserId ?? '';

  const today = new Date().toISOString().slice(0, 10);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.judges.myStats(personId, undefined),
    enabled: !!personId,
    queryFn: async () => {
      // Fetch judge_assignments for this judge joined to classes and trials
      // Filter to trials whose date matches today
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
            status,
            total_entries_count,
            checked_in_count,
            start_time,
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
          status: string;
          total_entries_count: number;
          checked_in_count: number;
          start_time: string | null;
          trials: { id: string; date: string } | null;
        } | null;
      };

      const allRows: Row[] = rows ?? [];

      // Filter to today's trials
      const todayRows = allRows.filter(r => r.classes?.trials?.date === today);

      const totalToday = todayRows.length;
      const completedToday = todayRows.filter(r => r.classes?.status === 'completed').length;
      const totalEntries = todayRows.reduce(
        (sum, r) => sum + (r.classes?.total_entries_count ?? 0),
        0
      );
      const checkedInCount = todayRows.reduce(
        (sum, r) => sum + (r.classes?.checked_in_count ?? 0),
        0
      );

      // Find next pending class by start_time
      const pending = todayRows
        .filter(r => r.classes?.status !== 'completed' && r.classes?.start_time)
        .sort((a, b) => {
          const ta = a.classes?.start_time ?? '';
          const tb = b.classes?.start_time ?? '';
          return ta.localeCompare(tb);
        });

      const nextClass = pending[0]?.classes?.name ?? null;

      return { totalToday, completedToday, totalEntries, checkedInCount, nextClass };
    },
  });

  return {
    totalToday: data?.totalToday ?? 0,
    completedToday: data?.completedToday ?? 0,
    totalEntries: data?.totalEntries ?? 0,
    checkedInCount: data?.checkedInCount ?? 0,
    nextClass: data?.nextClass ?? null,
    isLoading,
    error: error ? (error as Error).message : null,
  };
}

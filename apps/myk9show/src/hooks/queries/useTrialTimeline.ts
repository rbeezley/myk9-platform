import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { groupByJudge } from '@/components/schedule/schedule-timeline.utils';
import type {
  JudgeTimelineData,
  TrialTimelineClassRow,
} from '@/components/schedule/schedule-timeline.types';

export function useTrialTimeline(trialId: string | null) {
  return useQuery<JudgeTimelineData[]>({
    queryKey: ['trials', trialId, 'timeline'],
    queryFn: async () => {
      if (!trialId) return [];

      // Single query: classes with nested judge assignments + people
      const { data: classes, error } = await supabase
        .from('classes')
        .select(
          `
          id,
          name,
          element,
          level,
          start_time,
          status,
          total_entries_count,
          judge_assignments (
            person_id,
            people!inner (
              first_name,
              last_name
            )
          )
        `
        )
        .eq('trial_id', trialId)
        .is('deleted_at', null);

      if (error) throw error;
      if (!classes || classes.length === 0) return [];

      const rows: TrialTimelineClassRow[] = classes.map(cls => {
        const assignment = (
          cls.judge_assignments as Array<{
            person_id: string;
            people: { first_name: string; last_name: string };
          }>
        )?.[0];

        return {
          classId: cls.id,
          className: cls.name,
          element: cls.element,
          level: cls.level,
          startTime: cls.start_time,
          status: cls.status ?? 'no-status',
          totalEntriesCount: cls.total_entries_count ?? 0,
          judgePersonId: assignment?.person_id ?? null,
          judgeFirstName: assignment?.people.first_name ?? null,
          judgeLastName: assignment?.people.last_name ?? null,
        };
      });

      return groupByJudge(rows);
    },
    enabled: !!trialId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

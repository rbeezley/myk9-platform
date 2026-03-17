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

      const { data: classes, error: classesError } = await supabase
        .from('classes')
        .select('id, name, element, level, start_time, status, total_entries_count')
        .eq('trial_id', trialId)
        .is('deleted_at', null);

      if (classesError) throw classesError;
      if (!classes || classes.length === 0) return [];

      const classIds = classes.map(c => c.id);
      const { data: assignments, error: assignError } = await supabase
        .from('judge_assignments')
        .select('class_id, person_id, people!inner(first_name, last_name)')
        .in('class_id', classIds);

      if (assignError) throw assignError;

      const judgeMap = new Map<string, { personId: string; firstName: string; lastName: string }>();
      for (const a of assignments ?? []) {
        const person = a.people as unknown as { first_name: string; last_name: string };
        judgeMap.set(a.class_id!, {
          personId: a.person_id,
          firstName: person.first_name,
          lastName: person.last_name,
        });
      }

      const rows: TrialTimelineClassRow[] = classes.map(cls => {
        const judge = judgeMap.get(cls.id);
        return {
          classId: cls.id,
          className: cls.name,
          element: cls.element,
          level: cls.level,
          startTime: cls.start_time,
          status: cls.status ?? 'no-status',
          totalEntriesCount: cls.total_entries_count ?? 0,
          judgePersonId: judge?.personId ?? null,
          judgeFirstName: judge?.firstName ?? null,
          judgeLastName: judge?.lastName ?? null,
        };
      });

      return groupByJudge(rows);
    },
    enabled: !!trialId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

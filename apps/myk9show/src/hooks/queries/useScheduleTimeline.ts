import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { groupByDay } from '@/components/schedule/schedule-timeline.utils';
import type {
  DayTimelineData,
  TimelineClassRow,
} from '@/components/schedule/schedule-timeline.types';

export function useScheduleTimeline(showId: string | null) {
  return useQuery<DayTimelineData[]>({
    queryKey: ['shows', showId, 'schedule-timeline'],
    queryFn: async () => {
      if (!showId) return [];

      const { data, error } = await supabase
        .from('trials')
        .select(
          `
          id,
          date,
          trial_number,
          planned_start_time,
          classes (
            id,
            name,
            element,
            level,
            start_time,
            status,
            total_entries_count,
            deleted_at
          )
        `
        )
        .eq('show_id', showId)
        .is('deleted_at', null);

      if (error) throw error;
      if (!data) return [];

      const rows: TimelineClassRow[] = [];
      for (const trial of data) {
        const allClasses =
          (trial.classes as Array<{
            id: string;
            name: string;
            element: string | null;
            level: string | null;
            start_time: string | null;
            status: string | null;
            total_entries_count: number | null;
            deleted_at: string | null;
          }>) ?? [];
        const classes = allClasses.filter(c => c.deleted_at === null);

        for (const cls of classes) {
          rows.push({
            trialId: trial.id,
            trialDate: trial.date,
            trialNumber: trial.trial_number,
            trialPlannedStartTime: trial.planned_start_time,
            classId: cls.id,
            className: cls.name,
            element: cls.element,
            level: cls.level,
            startTime: cls.start_time,
            status: cls.status ?? 'no-status',
            totalEntriesCount: cls.total_entries_count ?? 0,
          });
        }
      }

      return groupByDay(rows);
    },
    enabled: !!showId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

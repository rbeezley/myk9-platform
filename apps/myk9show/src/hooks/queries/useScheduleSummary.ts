import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import {
  summarizeSchedule,
  type DaySummary,
  type ScheduleClassRow,
} from '../../utils/schedule-summary';

export function useScheduleSummary(showId: string | null) {
  return useQuery<DaySummary[]>({
    queryKey: ['shows', showId, 'schedule-summary'],
    queryFn: async () => {
      if (!showId) return [];

      const { data, error } = await supabase
        .from('trials')
        .select(
          `
          date,
          trial_type,
          classes (
            name,
            element,
            level,
            competition_type
          )
        `
        )
        .eq('show_id', showId);

      if (error) throw error;
      if (!data) return [];

      // Flatten trials → class rows
      const rows: ScheduleClassRow[] = [];
      for (const trial of data) {
        const classes =
          (trial.classes as Array<{
            name: string;
            element: string | null;
            level: string | null;
            competition_type: string | null;
          }>) ?? [];

        for (const cls of classes) {
          rows.push({
            trialDate: trial.date,
            discipline: trial.trial_type ?? cls.competition_type,
            element: cls.element,
            level: cls.level,
            name: cls.name,
          });
        }
      }

      return summarizeSchedule(rows);
    },
    enabled: !!showId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

import { useQuery } from '@tanstack/react-query';
import { groupByDay } from '@/components/schedule/schedule-timeline.utils';
import type { DayTimelineData } from '@/components/schedule/schedule-timeline.types';
import { getShowScheduleTimelineRows } from '@/services/database/trials';

export function useScheduleTimeline(showId: string | null) {
  return useQuery<DayTimelineData[]>({
    queryKey: ['shows', showId, 'schedule-timeline'],
    queryFn: async () => {
      if (!showId) return [];

      const { data, error } = await getShowScheduleTimelineRows(showId);
      if (error) throw error;
      return groupByDay(data);
    },
    enabled: !!showId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

import { useQuery } from '@tanstack/react-query';
import { groupByJudge } from '@/components/schedule/schedule-timeline.utils';
import type { JudgeTimelineData } from '@/components/schedule/schedule-timeline.types';
import { getTrialTimelineRows } from '@/services/database/trials';

export function useTrialTimeline(trialId: string | null) {
  return useQuery<JudgeTimelineData[]>({
    queryKey: ['trials', trialId, 'timeline'],
    queryFn: async () => {
      if (!trialId) return [];

      const { data, error } = await getTrialTimelineRows(trialId);
      if (error) throw error;
      return groupByJudge(data);
    },
    enabled: !!trialId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

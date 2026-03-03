import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { activityLogService } from '../services';
import type { ActivityLogFilters } from '../types';

export function useActivityLog(
  trialId: string | undefined,
  filters?: ActivityLogFilters
) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.trialActivityLog(trialId ?? ''), filters],
    queryFn: ({ pageParam = 0 }) =>
      activityLogService.getByTrial(trialId!, filters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.hasMore ? lastPageParam + 1 : undefined,
    enabled: !!trialId,
    ...cacheStrategies.dynamic,
  });
}

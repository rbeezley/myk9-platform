import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { getTVDisplayResults } from '@/services/database/tv-display';
import { TVCompletedClass } from './types';

interface TVResultsResult {
  completedClasses: TVCompletedClass[];
  isLoading: boolean;
  error: Error | null;
}

async function fetchTVResults(showId: string, trialId?: string): Promise<TVCompletedClass[]> {
  return getTVDisplayResults(showId, trialId);
}

export function useTVResults(showId: string, trialId?: string): TVResultsResult {
  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.tvResults(showId), trialId],
    queryFn: () => fetchTVResults(showId, trialId),
    ...cacheStrategies.realtime,
    enabled: !!showId,
  });

  return {
    completedClasses: data ?? [],
    isLoading,
    error: error as Error | null,
  };
}

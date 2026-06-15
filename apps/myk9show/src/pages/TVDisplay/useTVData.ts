import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { getTVDisplayData } from '@/services/database/tv-display';
import { TVShowInfo, TVClass } from './types';

interface TVDataResult {
  show: TVShowInfo | null;
  classes: TVClass[];
  isLoading: boolean;
  error: Error | null;
}

async function fetchTVData(
  showId: string,
  trialId?: string
): Promise<{ show: TVShowInfo | null; classes: TVClass[] }> {
  return getTVDisplayData(showId, trialId);
}

export function useTVData(showId: string, trialId?: string): TVDataResult {
  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.tvClasses(showId), trialId],
    queryFn: () => fetchTVData(showId, trialId),
    ...cacheStrategies.realtime,
    enabled: !!showId,
  });

  return {
    show: data?.show ?? null,
    classes: data?.classes ?? [],
    isLoading,
    error: error as Error | null,
  };
}

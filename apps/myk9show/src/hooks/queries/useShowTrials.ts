import { useQuery } from '@tanstack/react-query';
import { getTrialsByShow } from '@/services/database/trials';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';

/**
 * Fetches trials for a given show.
 * Used by the Entry Management page trial filter dropdown.
 * Disabled when showId is null (no show selected).
 */
/** `refetchOnMount: 'always'` for a reader that must see a trial edit saved since the last read. */
export interface UseShowTrialsOptions {
  refetchOnMount?: 'always' | boolean;
}

export function useShowTrials(showId: string | null, options: UseShowTrialsOptions = {}) {
  return useQuery({
    queryKey: queryKeys.showTrials(showId!),
    queryFn: async () => {
      const { data, error } = await getTrialsByShow(showId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!showId,
    ...cacheStrategies.moderate,
    // `getTrialsByShow` reads the replica first, so it must be allowed to run
    // offline: the default 'online' mode pauses the query without calling it,
    // and on a cold offline load the trials on the device were never read
    // (MYK9-1162: the "Registration number needed" pane skeleton never ended).
    networkMode: 'always',
    ...(options.refetchOnMount !== undefined && { refetchOnMount: options.refetchOnMount }),
  });
}

import { useQuery } from '@tanstack/react-query';
import { cacheStrategies } from '@/lib/queryClient';
import {
  getArmbandCountForShow,
  lookupDogByArmband,
} from '@/services/database/queries/armbandQueries';

export const armbandQueryKeys = {
  count: (showId: string) => ['armbands', 'count', showId] as const,
  lookup: (showId: string, armbandNumber: string) =>
    ['armbands', 'lookup', showId, armbandNumber] as const,
};

export function useArmbandCount(showId: string | undefined) {
  return useQuery({
    queryKey: armbandQueryKeys.count(showId ?? ''),
    queryFn: async () => {
      const { count, error } = await getArmbandCountForShow(showId!);
      if (error) throw error;
      return count;
    },
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}

export function useArmbandLookup(showId: string | undefined, armbandNumber: string | null) {
  return useQuery({
    queryKey: armbandQueryKeys.lookup(showId ?? '', armbandNumber ?? ''),
    queryFn: async () => {
      const { data, error } = await lookupDogByArmband(showId!, armbandNumber!);
      if (error) throw error;
      return data;
    },
    enabled: !!showId && !!armbandNumber,
    staleTime: 0,
    gcTime: 1000 * 60 * 2,
  });
}

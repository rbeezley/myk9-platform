/**
 * The reads `runCartCheckout` needs, for a caller with no `useCartCapacity`
 * mounted (the wizard's Pay button, MYK9-1964). Same query keys and fetchers as
 * the hooks /cart uses, so both pages share one cache entry.
 */
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { cartCapacityQueryKey, fetchCartCapacity } from '@/hooks/queries/useCartCapacity';
import { fetchShowJudges } from '@/hooks/queries/useShowJudges';
import type { CartCapacityRead } from './runCartCheckout';

/** A FRESH capacity read (never the cache), failing closed as `isError`. */
export function freshCartCapacityReader(
  queryClient: QueryClient,
  showId: string
): () => Promise<CartCapacityRead> {
  return async () => {
    try {
      const data = await queryClient.fetchQuery({
        queryKey: cartCapacityQueryKey(showId),
        queryFn: () => fetchCartCapacity(showId),
        staleTime: 0,
      });
      return { isError: false, data };
    } catch {
      return { isError: true };
    }
  };
}

/** Judge names, from the cache when fresh. Only label a full day; never block. */
export function judgeNamesLoader(
  queryClient: QueryClient
): (showId: string) => Promise<ReadonlyMap<string, string>> {
  return async showId => {
    const judges = await queryClient.fetchQuery({
      queryKey: queryKeys.showJudges(showId),
      queryFn: () => fetchShowJudges(showId),
      ...cacheStrategies.moderate,
    });
    return new Map(judges.map(judge => [judge.id, judge.name]));
  };
}

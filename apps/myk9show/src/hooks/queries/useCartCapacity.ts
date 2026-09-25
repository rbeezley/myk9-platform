/**
 * Capacity facts for the /cart wait-list/pay split (MYK9-753).
 *
 * Reads the SAME server truth as the registration wizard: the query key and
 * fetcher are `useClassAvailability`'s, so the two share one cache entry and
 * the wait-list mutations' invalidation refreshes both. Nothing here counts
 * `entries` rows: under the exhibitor's RLS those are only their own, which
 * made a class filled by other exhibitors look payable.
 *
 * `select` reshapes the per-class verdict into the split's inputs, and
 * `refetch()` resolves with that shape so the submit-time re-check reads fresh
 * facts (and `isError`) straight from its result.
 */

import { useQuery } from '@tanstack/react-query';
import {
  classAvailabilityQueryKey,
  fetchShowClassAvailability,
} from '@/hooks/useClassAvailability';
import { cartCapacityFromAvailability } from '@/features/payments/cartCapacityFromAvailability';

export function useCartCapacity(showId: string | undefined) {
  const query = useQuery({
    queryKey: classAvailabilityQueryKey(showId),
    queryFn: () => fetchShowClassAvailability(showId),
    select: cartCapacityFromAvailability,
    enabled: Boolean(showId),
  });

  return {
    judgeDays: query.data?.judgeDays ?? [],
    fullClassIds: query.data?.fullClassIds ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

/**
 * A page-level count for the Move-ups `ListViewTabs` badge (MYK9-795).
 *
 * `MoveUpRequestsTab` already fetches this same list once its own view is
 * active; this is a second, minimal read so the count can show on the tab
 * BEFORE that view is selected. Lifting the whole list up (so both surfaces
 * shared one fetch) would be a larger restructure of `MoveUpRequestsTab`'s
 * own data flow — the smaller diff the ticket calls out as acceptable.
 */
import { useQuery } from '@tanstack/react-query';
import { getPendingMoveUpRequests } from '@/services/database/day-of-operations';

export function useMoveUpRequestsCount(showId: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: ['move-up-requests-count', showId],
    queryFn: async () => {
      const { data: requests } = await getPendingMoveUpRequests(showId as string);
      return requests.length;
    },
    enabled: Boolean(showId),
  });

  return { count: data ?? 0, isLoading };
}

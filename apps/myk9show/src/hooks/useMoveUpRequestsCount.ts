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
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['move-up-requests-count', showId],
    queryFn: async () => {
      // `getPendingMoveUpRequests` never throws — it returns `{ data: [], error
      // }` on a failed read (move-up.ts's catch branch). Raising here turns
      // that into a query error instead of a silent, confident 0.
      const { data: requests, error } = await getPendingMoveUpRequests(showId as string);
      if (error) throw error;
      return requests.length;
    },
    enabled: Boolean(showId),
  });

  // No show selected: there is nothing to count, which is a real 0, not an
  // unknown. Otherwise an unknown count (still loading, or the read failed)
  // is `undefined` — not a 0 — matching `blockingEntryCount.ts` / MYK9-600.
  const count = !showId ? 0 : isError ? undefined : data;

  return { count, isLoading, refetch };
}

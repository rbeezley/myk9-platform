import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';
import type { JudgeDayCapacity } from '@/types/waitlist-types';
import { judgeDayCapacityFromServer } from './judgeDayCapacityFromServer';

/** The one query key for a show's judge-day capacity, so a writer can invalidate it. */
export const judgeDayCapacityKey = (showId: string | undefined) =>
  [queryKeys.show(showId!), 'judge-day-capacity'] as const;

/**
 * Judge-day capacity for the secretary's Waitlist tab (MYK9-1005).
 *
 * One read, `get_show_judge_day_capacity_for_manager`: capacity, taken, mail-in reserve and
 * remaining are the server's own figures, with EVERY account's held spots counted as taken. The
 * cart's read (`get_show_class_judge_day_availability`) leaves out the caller's own holds, which
 * would show a secretary who is also mid-checkout their own held spot as free, and the offer
 * would then be refused. Nothing is recomputed in the browser. Online-only: offline the query
 * parks (`isPaused`), which the page reports as unavailable rather than as an empty list.
 */
export function useJudgeDayCapacity(showId: string | undefined) {
  const query = useQuery({
    queryKey: judgeDayCapacityKey(showId),
    queryFn: async (): Promise<JudgeDayCapacity[]> => {
      const { data, error } = await supabase.rpc('get_show_judge_day_capacity_for_manager', {
        p_show_id: showId!,
      });
      if (error) throw new Error(error.message);
      return judgeDayCapacityFromServer(data ?? []);
    },
    enabled: !!showId,
    // Counts move without this page's help (automatic offers, other secretaries); re-read on
    // every mount rather than trusting a cached figure for the default five minutes.
    staleTime: 0,
    refetchOnMount: 'always',
  });

  return {
    judgeDays: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    // Parked offline (a server read): no figures yet, which is not the same as no judge-days.
    isPaused: query.fetchStatus === 'paused',
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

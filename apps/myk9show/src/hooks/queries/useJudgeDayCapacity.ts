import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';
import type { JudgeDayCapacity } from '@/types/waitlist-types';
import {
  JUDGE_DAY_CAPACITY_UNREADABLE,
  judgeDayCapacityFromServer,
  type JudgeDaySummaryRow,
} from './judgeDayCapacityFromServer';

/**
 * Judge-day capacity for the secretary's Waitlist tab (MYK9-1005).
 *
 * Capacity, taken (active holds included), mail-in reserve and remaining are the server's own
 * figures, from the same RPC the cart reads (`get_show_class_judge_day_availability`); nothing is
 * recomputed in the browser. `judge_day_summary` supplies only the judge's name, the day's classes
 * and the waiting count. Online-only: offline the query parks (`isPaused`), which the page reports
 * as unavailable rather than as an empty list.
 */
/** The one query key for a show's judge-day capacity, so a writer can invalidate it. */
export const judgeDayCapacityKey = (showId: string | undefined) =>
  [queryKeys.show(showId!), 'judge-day-capacity'] as const;

export function useJudgeDayCapacity(showId: string | undefined) {
  const query = useQuery({
    queryKey: judgeDayCapacityKey(showId),
    queryFn: async (): Promise<JudgeDayCapacity[]> => {
      const [summaryResult, availabilityResult] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('judge_day_summary').select('*').eq('show_id', showId!),
        supabase.rpc('get_show_class_judge_day_availability', { p_show_id: showId! }),
      ]);

      if (summaryResult.error) throw summaryResult.error;
      if (availabilityResult.error) throw availabilityResult.error;

      const summary = (summaryResult.data as JudgeDaySummaryRow[]) ?? [];
      const availability = availabilityResult.data ?? [];
      // A show with judge-days has classes; no rows at all means the server could not show them.
      if (summary.length > 0 && availability.length === 0) {
        throw new Error(JUDGE_DAY_CAPACITY_UNREADABLE);
      }
      return judgeDayCapacityFromServer(summary, availability);
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

/**
 * Capacity facts for the /cart wait-list/pay split (MYK9-753).
 *
 * Reads the SAME server truth as the registration wizard,
 * `fetchShowClassAvailability` (`get_show_class_availability`), under a key
 * nested in `classAvailabilityQueryKey`, so the wait-list mutations'
 * invalidation of that key refreshes the cart too. Nothing here counts
 * `entries` rows: under the exhibitor's RLS those are only their own, which
 * made a class filled by other exhibitors look payable.
 *
 * The confirmed judge assignments are read alongside, because the server names
 * one judge per class and the split must charge a line in a multi-judge class
 * against every judge's day (see `cartCapacityFromAvailability`). A failed
 * read of either is an error, never "open".
 *
 * `refetch()` resolves with the split's inputs, so the submit-time re-check
 * reads fresh facts (and `isError`) straight from its result.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  classAvailabilityQueryKey,
  fetchShowClassAvailability,
} from '@/hooks/useClassAvailability';
import {
  cartCapacityFromAvailability,
  type CartCapacityFacts,
  type CartJudgeAssignment,
} from '@/features/payments/cartCapacityFromAvailability';

interface JudgeAssignmentRow {
  class_id: string | null;
  person_id: string | null;
  trials: { date: string } | null;
}

async function fetchConfirmedJudgeAssignments(showId: string): Promise<CartJudgeAssignment[]> {
  const { data, error } = await supabase
    .from('judge_assignments')
    .select('class_id, person_id, trials!inner(date)')
    .eq('show_id', showId)
    .eq('status', 'confirmed');
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as JudgeAssignmentRow[]).flatMap(row =>
    row.class_id && row.person_id && row.trials?.date
      ? [{ classId: row.class_id, judgeId: row.person_id, date: row.trials.date }]
      : []
  );
}

async function fetchCartCapacity(showId: string | undefined): Promise<CartCapacityFacts> {
  if (!showId) return { judgeDays: [], fullClassIds: [] };
  const [classes, assignments] = await Promise.all([
    fetchShowClassAvailability(showId),
    fetchConfirmedJudgeAssignments(showId),
  ]);
  return cartCapacityFromAvailability(classes, assignments);
}

export function useCartCapacity(showId: string | undefined) {
  const query = useQuery({
    queryKey: [...classAvailabilityQueryKey(showId), 'cart'],
    queryFn: () => fetchCartCapacity(showId),
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

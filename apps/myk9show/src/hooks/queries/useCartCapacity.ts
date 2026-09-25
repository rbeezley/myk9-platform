/**
 * Capacity facts for the /cart pay/wait-list split (MYK9-753).
 *
 * Reads `get_show_class_judge_day_availability`: every judge day's real
 * self-service spots left and each limited class's spots left, counted by the
 * server over every entry in the show (`get_judge_day_capacity_live`, the
 * figure payment decides on), not the rows the exhibitor's RLS returns. The
 * old cart recount of `entries` saw only the exhibitor's own rows, so a class
 * filled by others looked payable.
 *
 * Online-only, like the rest of checkout: Stripe needs the network, so this
 * does not go through replication. A failed read, or a show that returns no
 * rows at all, is an error, never "open". The key nests under
 * `classAvailabilityQueryKey`, so invalidating the wizard's availability (the
 * wait-list mutations do) refreshes the cart too.
 *
 * Judge names come from `get_show_judges` (public for a published show) and
 * only label a full day in the copy.
 *
 * `refetch()` resolves with the split's inputs, so checkout's re-check reads
 * fresh facts (and `isError`) straight from its result.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { classAvailabilityQueryKey } from '@/hooks/useClassAvailability';
import {
  cartCapacityFromJudgeDays,
  type CartCapacityFacts,
} from '@/features/payments/cartCapacityFromJudgeDays';
import { useShowJudges } from './useShowJudges';

export const CART_CAPACITY_UNREADABLE =
  'Class availability could not be read for this show. Please try again.';

export const cartCapacityQueryKey = (showId: string | undefined) =>
  [...classAvailabilityQueryKey(showId), 'judge-days'] as const;

export async function fetchCartCapacity(showId: string): Promise<CartCapacityFacts> {
  const { data, error } = await supabase.rpc('get_show_class_judge_day_availability', {
    p_show_id: showId,
  });
  if (error) throw new Error(error.message);
  // A show with a cart has classes; no rows means the read could not see it.
  if (!data || data.length === 0) throw new Error(CART_CAPACITY_UNREADABLE);
  return cartCapacityFromJudgeDays(data);
}

export function useCartCapacity(showId: string | undefined) {
  const query = useQuery({
    queryKey: cartCapacityQueryKey(showId),
    queryFn: () => fetchCartCapacity(showId!),
    enabled: Boolean(showId),
  });
  // Names only label a full judge day in the cart's copy; without them the
  // copy names the date alone, so a failed read here blocks nothing.
  const { data: judges } = useShowJudges(showId);
  const judgeNameById = useMemo(
    () => new Map((judges ?? []).map(judge => [judge.id, judge.name])),
    [judges]
  );

  return {
    judgeDays: query.data?.judgeDays ?? [],
    classSpots: query.data?.classSpots ?? [],
    judgeNameById,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

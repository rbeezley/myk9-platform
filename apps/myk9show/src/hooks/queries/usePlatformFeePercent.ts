import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PLATFORM_FEE_PERCENT } from '@/store/cartStore.helpers';

const MAX_FEE_PERCENT = 20;

/**
 * The live platform fee percent from the `platform_settings` singleton, which a
 * site admin can change with no deploy.
 *
 * TWO hooks over one query, because the two callers need different things from
 * a rate that has not been read:
 *
 *  - `usePlatformFeePercent()` collapses loading / failure / absent into the
 *    constant 7. Correct for the CART PREVIEW: a plausible number beats a blank,
 *    and stripe-checkout reads the same row server-side (authoritative for the
 *    actual charge), so the preview only has to agree, not decide.
 *  - `usePlatformFeePercentQuery()` keeps `null` for "not read" and reports the
 *    query state. Required by the surface that EDITS the rate, where the
 *    constant would be a fabricated fact — and where a "has this changed?"
 *    comparison against it silently inverts (MYK9 impeccable p11 / B3).
 *
 * The queryFn itself returns `number | null` so the distinction is made ONCE,
 * at the read, rather than re-derived by each caller.
 */
function platformFeePercentQueryOptions() {
  return {
    queryKey: ['platform-settings', 'fee-percent'] as const,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('platform_fee_percent')
        .eq('id', true)
        .maybeSingle();
      if (error) throw error;
      // numeric(5,2) may arrive as a string from PostgREST; coerce + bounds-check.
      const raw: unknown = data?.platform_fee_percent;
      const parsed = typeof raw === 'string' ? Number(raw) : raw;
      if (
        typeof parsed !== 'number' ||
        !Number.isFinite(parsed) ||
        parsed < 0 ||
        parsed > MAX_FEE_PERCENT
      ) {
        // Absent row or a value outside the allowed range: we did not read a
        // usable rate. null, not 7 — each caller decides what to do about it.
        return null;
      }
      return parsed;
    },
    // Payment-facing: the server charges the live platform_settings rate, so the
    // preview must not show a stale fee. Keep it short-lived and revalidate when
    // the cart is opened / refocused, rather than caching for minutes.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: 'always' as const,
    refetchOnWindowFocus: true,
  };
}

/**
 * Why a nominal union and not `{ percent, isLoading, isError }`: those three
 * booleans cannot express the two states that actually matter here, and both
 * resolve toward the confident answer if you let them.
 *
 *  - 'unavailable' covers BOTH a failed read and a PAUSED one. React Query keeps
 *    the last good `data` when a refetch fails, so `isError` alongside a stale
 *    number would let the card show that number as current and let an admin
 *    overwrite the live checkout rate from it. And with networkMode:'online' an
 *    offline load is neither loading nor errored, so anything keyed on those two
 *    booleans reads a never-executed query as a definite answer.
 *  - 'absent' is the one genuine fact in that neighbourhood: the row resolved and
 *    holds no usable rate. It is the only arm that may say so to the operator.
 */
export type PlatformFeeRateState = 'loading' | 'unavailable' | 'absent' | 'ready';

export interface PlatformFeePercentQuery {
  /** Non-null ONLY when `state` is 'ready'. Never a cached value from a failed read. */
  percent: number | null;
  state: PlatformFeeRateState;
}

/** The fee rate WITH its query state, for the surface that edits it. */
export function usePlatformFeePercentQuery(): PlatformFeePercentQuery {
  const { data, isPending, isError, fetchStatus } = useQuery(platformFeePercentQueryOptions());

  // Exhaustive over the two things that can make a rate untrustworthy, BEFORE
  // any arm that exposes a number. Both discard cached data, because React Query
  // retains the last good `data` through a failed refetch AND through a paused
  // one — and this rate can be overwritten by the caller, so a stale value is
  // not a harmless placeholder here the way it is in the cart preview.
  //
  //   isError            a refetch failed; the cached rate may be out of date
  //   fetchStatus paused offline. With refetchOnMount:'always' a remount while
  //                      offline pauses WITH data still cached, so testing for
  //                      `data === undefined` here would miss the case that
  //                      matters most: an editor re-enabled on a stale rate.
  if (isError) return { percent: null, state: 'unavailable' };
  if (fetchStatus === 'paused') return { percent: null, state: 'unavailable' };
  if (isPending) return { percent: null, state: 'loading' };
  if (data === null || data === undefined) return { percent: null, state: 'absent' };
  return { percent: data, state: 'ready' };
}

/** The fee rate for DISPLAY, with the cart-preview fallback baked in. */
export function usePlatformFeePercent(): number {
  const { data } = useQuery(platformFeePercentQueryOptions());
  return data ?? PLATFORM_FEE_PERCENT;
}

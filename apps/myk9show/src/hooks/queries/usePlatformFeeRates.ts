import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_PLATFORM_FEE_RATES,
  normalizePlatformFeeRates,
  type PlatformFeeRates,
} from '@/store/cartStore.helpers';

const MAX_FEE_PERCENT = 20;

/**
 * The live platform fee rates from the `platform_settings` singleton, which a
 * site admin can change with no deploy: the percent, the flat per-checkout
 * component, and the floor (MYK9-197). flat/min are 0 unless deliberately set,
 * so by default this is the percentage-only rate it has always been.
 *
 * TWO hooks over one query, because the two callers need different things from
 * rates that have not been read:
 *
 *  - `usePlatformFeeRates()` collapses loading / failure / absent into the
 *    fallback defaults. Correct for the CART PREVIEW: a plausible number beats a
 *    blank, and stripe-checkout reads the same row server-side (authoritative
 *    for the actual charge), so the preview only has to agree, not decide.
 *  - `usePlatformFeeRatesQuery()` keeps `null` for "not read" and reports the
 *    query state. Required by the surface that EDITS the rates, where the
 *    constants would be a fabricated fact — and where a "has this changed?"
 *    comparison against them silently inverts (MYK9 impeccable p11 / B3).
 *
 * The queryFn itself returns `PlatformFeeRates | null` so the distinction is
 * made ONCE, at the read, rather than re-derived by each caller.
 */
function platformFeeRatesQueryOptions() {
  return {
    queryKey: ['platform-settings', 'fee-rates'] as const,
    queryFn: async (): Promise<PlatformFeeRates | null> => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('platform_fee_percent, platform_fee_flat_cents, platform_fee_min_cents')
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
        // Absent row or a percent outside the allowed range: we did not read
        // usable rates. null, not the default — each caller decides what to do
        // about it. The percent is the gate because it is the only column that
        // has ever been required; flat/min normalize to 0 when unusable, which
        // is also their default, and the SERVER normalizes identically so the
        // preview and the charge cannot diverge on a nonsense stored value.
        return null;
      }
      return normalizePlatformFeeRates({
        percent: parsed,
        flatCents: Number(data?.platform_fee_flat_cents ?? 0),
        minCents: Number(data?.platform_fee_min_cents ?? 0),
      });
    },
    // Payment-facing: the server charges the live platform_settings rates, so the
    // preview must not show a stale fee. Keep it short-lived and revalidate when
    // the cart is opened / refocused, rather than caching for minutes.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: 'always' as const,
    refetchOnWindowFocus: true,
  };
}

/**
 * Why a nominal union and not `{ rates, isLoading, isError }`: those three
 * booleans cannot express the two states that actually matter here, and both
 * resolve toward the confident answer if you let them.
 *
 *  - 'unavailable' covers BOTH a failed read and a PAUSED one. React Query keeps
 *    the last good `data` when a refetch fails, so `isError` alongside stale
 *    values would let the card show them as current and let an admin overwrite
 *    the live checkout rates from them. And with networkMode:'online' an
 *    offline load is neither loading nor errored, so anything keyed on those two
 *    booleans reads a never-executed query as a definite answer.
 *  - 'absent' is the one genuine fact in that neighbourhood: the row resolved and
 *    holds no usable rate. It is the only arm that may say so to the operator.
 */
export type PlatformFeeRateState = 'loading' | 'unavailable' | 'absent' | 'ready';

export interface PlatformFeeRatesQuery {
  /** Non-null ONLY when `state` is 'ready'. Never a cached value from a failed read. */
  rates: PlatformFeeRates | null;
  state: PlatformFeeRateState;
}

/** The fee rates WITH their query state, for the surface that edits them. */
export function usePlatformFeeRatesQuery(): PlatformFeeRatesQuery {
  const { data, isPending, isError, fetchStatus } = useQuery(platformFeeRatesQueryOptions());

  // Exhaustive over the two things that can make the rates untrustworthy, BEFORE
  // any arm that exposes a number. Both discard cached data, because React Query
  // retains the last good `data` through a failed refetch AND through a paused
  // one — and these rates can be overwritten by the caller, so a stale value is
  // not a harmless placeholder here the way it is in the cart preview.
  //
  //   isError            a refetch failed; the cached rates may be out of date
  //   fetchStatus paused offline. With refetchOnMount:'always' a remount while
  //                      offline pauses WITH data still cached, so testing for
  //                      `data === undefined` here would miss the case that
  //                      matters most: an editor re-enabled on stale rates.
  if (isError) return { rates: null, state: 'unavailable' };
  if (fetchStatus === 'paused') return { rates: null, state: 'unavailable' };
  if (isPending) return { rates: null, state: 'loading' };
  if (data === null || data === undefined) return { rates: null, state: 'absent' };
  return { rates: data, state: 'ready' };
}

/** The fee rates for DISPLAY, with the cart-preview fallback baked in. */
export function usePlatformFeeRates(): PlatformFeeRates {
  const { data } = useQuery(platformFeeRatesQueryOptions());
  return data ?? DEFAULT_PLATFORM_FEE_RATES;
}

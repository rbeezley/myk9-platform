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

export interface PlatformFeePercentQuery {
  /** The live rate, or null when it has not been read (loading / failed / absent). */
  percent: number | null;
  isLoading: boolean;
  isError: boolean;
}

/** The fee rate WITH its query state, for the surface that edits it. */
export function usePlatformFeePercentQuery(): PlatformFeePercentQuery {
  const { data, isLoading, isError } = useQuery(platformFeePercentQueryOptions());
  return { percent: data ?? null, isLoading, isError };
}

/** The fee rate for DISPLAY, with the cart-preview fallback baked in. */
export function usePlatformFeePercent(): number {
  const { data } = useQuery(platformFeePercentQueryOptions());
  return data ?? PLATFORM_FEE_PERCENT;
}

import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/services/database/_shared/untyped-from';
import { PLATFORM_FEE_PERCENT } from '@/store/cartStore.helpers';

const MAX_FEE_PERCENT = 20;

/**
 * The live platform fee percent from the `platform_settings` singleton, which a
 * site admin can change with no deploy. Returns `PLATFORM_FEE_PERCENT` (7) as the
 * fallback before the row resolves or if it's absent/out of bounds.
 *
 * stripe-checkout reads the same row server-side (authoritative for the actual
 * charge); this hook keeps the cart preview's displayed fee in agreement.
 *
 * untypedFrom: platform_settings (migration 20260615180000) is not yet in the
 * generated Database types; switch to supabase.from() after regeneration.
 */
export function usePlatformFeePercent(): number {
  const { data } = useQuery({
    queryKey: ['platform-settings', 'fee-percent'],
    queryFn: async (): Promise<number> => {
      const { data, error } = await untypedFrom('platform_settings')
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
        return PLATFORM_FEE_PERCENT;
      }
      return parsed;
    },
    // Payment-facing: the server charges the live platform_settings rate, so the
    // preview must not show a stale fee. Keep it short-lived and revalidate when
    // the cart is opened / refocused, rather than caching for minutes.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
  return data ?? PLATFORM_FEE_PERCENT;
}

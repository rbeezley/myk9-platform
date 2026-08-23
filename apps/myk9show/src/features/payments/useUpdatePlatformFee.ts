import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { PlatformFeeRates } from '@/store/cartStore.helpers';

/** Mirrors PLATFORM_FEE_LIMITS in supabase/functions/_shared/platformFee.ts and
 *  the CHECK constraints on platform_settings (migration 20260823140000). */
export const PLATFORM_FEE_BOUNDS = {
  maxPercent: 20,
  maxFlatCents: 500,
  maxMinCents: 2000,
} as const;

/**
 * Update the platform fee on the platform_settings singleton. Site-admin only —
 * enforced server-side by RLS + the write-guard trigger; this hook is rendered
 * behind the SITE_ADMIN route guard. On success it invalidates the fee preview
 * (usePlatformFeeRates) and the ledger so both reflect the new rates.
 *
 * All three components are written TOGETHER (MYK9-197). The fee is one
 * expression — `max(percent × subtotal + flat, min)` — so writing one column
 * without the others would leave the row describing a fee nobody chose.
 */
export function useUpdatePlatformFee() {
  const queryClient = useQueryClient();
  const { userWithRoles } = useAuthContext();
  const updatedBy = userWithRoles?.databaseUserId ?? null;

  return useMutation({
    mutationFn: async (rates: PlatformFeeRates): Promise<PlatformFeeRates> => {
      if (!Number.isFinite(rates.percent) || rates.percent < 0 || rates.percent > PLATFORM_FEE_BOUNDS.maxPercent) {
        throw new Error(
          `Platform fee must be between 0 and ${PLATFORM_FEE_BOUNDS.maxPercent} percent.`
        );
      }
      if (
        !Number.isInteger(rates.flatCents) ||
        rates.flatCents < 0 ||
        rates.flatCents > PLATFORM_FEE_BOUNDS.maxFlatCents
      ) {
        throw new Error(
          `The flat fee must be a whole number of cents between 0 and ${PLATFORM_FEE_BOUNDS.maxFlatCents}.`
        );
      }
      if (
        !Number.isInteger(rates.minCents) ||
        rates.minCents < 0 ||
        rates.minCents > PLATFORM_FEE_BOUNDS.maxMinCents
      ) {
        throw new Error(
          `The minimum fee must be a whole number of cents between 0 and ${PLATFORM_FEE_BOUNDS.maxMinCents}.`
        );
      }
      const { error } = await supabase
        .from('platform_settings')
        .update({
          platform_fee_percent: rates.percent,
          platform_fee_flat_cents: rates.flatCents,
          platform_fee_min_cents: rates.minCents,
          updated_at: new Date().toISOString(),
          updated_by: updatedBy,
        })
        .eq('id', true);
      if (error) throw error;
      return rates;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'payout-ledger'] });
    },
  });
}

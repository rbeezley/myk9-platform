import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/hooks/useAuthContext';

const MAX_FEE_PERCENT = 20;

/**
 * Update the platform fee on the platform_settings singleton. Site-admin only —
 * enforced server-side by RLS + the write-guard trigger; this hook is rendered
 * behind the SITE_ADMIN route guard. On success it invalidates the fee preview
 * (usePlatformFeePercent) and the ledger so both reflect the new rate.
 */
export function useUpdatePlatformFee() {
  const queryClient = useQueryClient();
  const { userWithRoles } = useAuthContext();
  const updatedBy = userWithRoles?.databaseUserId ?? null;

  return useMutation({
    mutationFn: async (percent: number): Promise<number> => {
      if (!Number.isFinite(percent) || percent < 0 || percent > MAX_FEE_PERCENT) {
        throw new Error(`Platform fee must be between 0 and ${MAX_FEE_PERCENT} percent.`);
      }
      const { error } = await supabase
        .from('platform_settings')
        .update({
          platform_fee_percent: percent,
          updated_at: new Date().toISOString(),
          updated_by: updatedBy,
        })
        .eq('id', true);
      if (error) throw error;
      return percent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'payout-ledger'] });
    },
  });
}

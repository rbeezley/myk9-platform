/**
 * MYK9-1688: the ADVISORY refund for a withdrawal that has not happened yet.
 *
 * `useWithdrawalRefundSuggestion` is the post-withdrawal read: it judges the cutoff against the
 * entry's stamped `withdrawn_at`, which is null until the entry is withdrawn, so before the
 * withdrawal it can only say "manual". This reads the same policy snapshot and trial timezone
 * and resolves them, through the same `resolveWithdrawalRefundCents`, against the proposed
 * withdrawal time (now). It shows a figure only; nothing here issues or records a refund, and it
 * does not touch the post-withdrawal query cache.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getTrialTimezone } from '@/features/registries';
import {
  resolveWithdrawalRefundCents,
  type WithdrawalPolicy,
  type WithdrawalRefundSuggestion,
} from './withdrawalPolicy';

export function useWithdrawalRefundPreview(
  entryId: string | null | undefined,
  entryFeeCents: number,
  enabled = true
) {
  return useQuery<WithdrawalRefundSuggestion>({
    queryKey: ['withdrawal-refund-preview', entryId, entryFeeCents],
    enabled: enabled && !!entryId,
    // The answer depends on the clock (before or after the cutoff day): never reuse a stale one.
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entries')
        .select('withdrawal_policy_snapshot, trials(timezone)')
        .eq('id', entryId as string)
        .single();
      if (error) throw error;
      const row = data as unknown as Record<string, unknown>;
      const snapshot = (row.withdrawal_policy_snapshot ?? null) as WithdrawalPolicy | null;
      const rawTrial = row.trials;
      const trial = (Array.isArray(rawTrial) ? rawTrial[0] : rawTrial) as {
        timezone?: string | null;
      } | null;
      return resolveWithdrawalRefundCents(
        snapshot,
        entryFeeCents,
        new Date(),
        getTrialTimezone(trial)
      );
    },
  });
}

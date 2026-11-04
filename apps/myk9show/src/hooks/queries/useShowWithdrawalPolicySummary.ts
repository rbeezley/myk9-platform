/**
 * Read-only withdrawal policy for a show (the About tab's summary). The editable card
 * (`WithdrawalPolicyCard`) keeps its own form-shaped read; this key sits under the card's
 * `['withdrawal-policy', 'show', id]` prefix, so the card's save invalidates this read too.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ShowWithdrawalPolicySummary {
  cutoffDate: string | null;
  retentionType: 'flat' | 'percent' | null;
  /** Cents when flat, whole percent when percent. */
  retentionValue: number | null;
  notes: string | null;
}

export function useShowWithdrawalPolicySummary(showId: string) {
  return useQuery({
    queryKey: ['withdrawal-policy', 'show', showId, 'summary'],
    queryFn: async (): Promise<ShowWithdrawalPolicySummary> => {
      const { data, error } = await supabase
        .from('shows')
        .select(
          'withdrawal_cutoff_date, withdrawal_retention_type, withdrawal_retention_value, withdrawal_policy_notes'
        )
        .eq('id', showId)
        .single();
      if (error) throw error;
      const type = data.withdrawal_retention_type;
      return {
        cutoffDate: data.withdrawal_cutoff_date ?? null,
        retentionType: type === 'flat' || type === 'percent' ? type : null,
        retentionValue: data.withdrawal_retention_value ?? null,
        notes: data.withdrawal_policy_notes ?? null,
      };
    },
  });
}

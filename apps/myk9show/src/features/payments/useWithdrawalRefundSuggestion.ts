/**
 * Computes the SUGGESTED voluntary-withdrawal refund for an entry from the
 * policy that was snapshotted onto it at payment time (Phase 3b) — not the live
 * club/show policy, so a later policy edit can't change what the exhibitor
 * agreed to. The suggestion is advisory; the secretary always overrides (D5).
 *
 * Reference time ("before or after the refund cutoff?") = the entry's
 * withdrawal time, proxied by entries.updated_at (≈ when it was pulled), falling
 * back to now when unavailable.
 *
 * See docs/plan-refund-policy-withdrawal.md (Phase 4, D5).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  resolveWithdrawalRefundCents,
  type WithdrawalPolicy,
  type WithdrawalRefundReason,
} from './withdrawalPolicy';

const DEFAULT_TIMEZONE = 'America/New_York';

export interface WithdrawalRefundSuggestion {
  /** A policy was captured at payment → show the disclosure + drive the pre-fill. */
  hasPolicy: boolean;
  refundCents: number;
  retainedCents: number;
  /** Prose-only / unset policy → don't auto-select; the secretary decides. */
  requiresManual: boolean;
  reason: WithdrawalRefundReason;
  policy: WithdrawalPolicy | null;
}

export function useWithdrawalRefundSuggestion(
  entryId: string | null | undefined,
  entryFeeCents: number,
  enabled = true
) {
  return useQuery<WithdrawalRefundSuggestion>({
    queryKey: ['withdrawal-refund-suggestion', entryId, entryFeeCents],
    enabled: enabled && !!entryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entries')
        .select('withdrawal_policy_snapshot, updated_at, trials(timezone)')
        .eq('id', entryId as string)
        .single();
      if (error) throw error;

      const row = data as unknown as Record<string, unknown>;
      const snapshot = (row.withdrawal_policy_snapshot ?? null) as WithdrawalPolicy | null;

      const rawTrial = row.trials;
      const trial = (Array.isArray(rawTrial) ? rawTrial[0] : rawTrial) as {
        timezone?: string | null;
      } | null;
      const timeZone = trial?.timezone || DEFAULT_TIMEZONE;

      const updatedAt = (row.updated_at as string | null) ?? null;
      const asOf = updatedAt ? new Date(updatedAt) : new Date();

      const result = resolveWithdrawalRefundCents(snapshot, entryFeeCents, asOf, timeZone);
      return {
        hasPolicy: snapshot !== null,
        refundCents: result.refundCents,
        retainedCents: result.retainedCents,
        requiresManual: result.requiresManual,
        reason: result.reason,
        policy: snapshot,
      };
    },
  });
}

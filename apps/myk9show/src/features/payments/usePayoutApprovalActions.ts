/**
 * MYK9-2171: Approve and Hold for a payout waiting behind the payout brake.
 *
 * Both call MYK9-2170's RPCs; the server checks the site admin and, for Approve,
 * the recent password (require_recent_reauth raises MKAUT, which the Supabase
 * client's fetch answers with the one step-up prompt, then replays). Nothing
 * here prompts on its own.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { holdReasonProblem } from './payoutApproval';
import { PAYOUT_LEDGER_QUERY_KEY } from './usePlatformPayoutLedger';

/**
 * Payout decisions run once, now, or not at all. The app's default mutation
 * policy retries once (so a cancelled password prompt would open a second one)
 * and pauses offline writes to replay on reconnect (so a decision could land
 * long after the operator left the screen). Neither is acceptable for money.
 */
export const PAYOUT_DECISION_MUTATION_OPTIONS = {
  retry: false,
  networkMode: 'always',
} as const;

export interface ApprovePayoutInput {
  payoutId: string;
  /** The amount the operator was shown: show_payouts.amount_cents as read. */
  amountCents: number;
  /** The Stripe account id the operator was shown, so the server can refuse if it changed. */
  stripeAccountId: string;
}

export function useApprovePayout() {
  const queryClient = useQueryClient();
  return useMutation({
    ...PAYOUT_DECISION_MUTATION_OPTIONS,
    mutationFn: async ({ payoutId, amountCents, stripeAccountId }: ApprovePayoutInput) => {
      const { data, error } = await supabase.rpc('approve_show_payout', {
        p_payout_id: payoutId,
        p_amount_cents: amountCents,
        p_expected_stripe_account_id: stripeAccountId,
      });
      if (error) throw error;
      return data as string;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PAYOUT_LEDGER_QUERY_KEY }),
  });
}

export interface HoldPayoutInput {
  payoutId: string;
  reason: string;
}

export function useHoldPayout() {
  const queryClient = useQueryClient();
  return useMutation({
    ...PAYOUT_DECISION_MUTATION_OPTIONS,
    // The reason is free text about a club's money; keep it out of the error log.
    meta: { sensitiveVariables: true },
    mutationFn: async ({ payoutId, reason }: HoldPayoutInput) => {
      const problem = holdReasonProblem(reason);
      if (problem) throw new Error(problem);
      const { data, error } = await supabase.rpc('hold_show_payout', {
        p_payout_id: payoutId,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      return data as string;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PAYOUT_LEDGER_QUERY_KEY }),
  });
}

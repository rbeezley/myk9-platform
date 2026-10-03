/**
 * Refunds awaiting a site admin's approval (MYK9-876). Refunds are never
 * automatic: stripe-webhook queues a `refund_requests` row and alerts; the
 * Approve action here calls `stripe-approve-refund`, which issues the Stripe
 * refund. A direct Supabase read is correct: this is online-only,
 * server-authoritative admin data (RLS: site admins read), not show-day data.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { OPERATOR_ALERTS_QUERY_KEY } from './useOperatorAlerts';
import {
  approvalErrorMessage,
  parseRefundRequest,
  type ApprovalOutcome,
  type RefundRequest,
  type RefundRequestRow,
} from './refundRequestsPresentation';

export const REFUND_REQUESTS_QUERY_KEY = ['admin', 'system-health', 'refund-requests'] as const;

async function fetchOpenRefundRequests(): Promise<RefundRequest[]> {
  const { data, error } = await supabase
    .from('refund_requests')
    .select(
      'id, kind, status, amount_cents, reason, stripe_payment_intent_id, stripe_checkout_session_id, created_at, last_failure'
    )
    .neq('status', 'refunded')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(row => parseRefundRequest(row as RefundRequestRow));
}

export function useRefundRequests() {
  return useQuery({
    queryKey: REFUND_REQUESTS_QUERY_KEY,
    queryFn: fetchOpenRefundRequests,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useApproveRefundRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string): Promise<ApprovalOutcome> => {
      const { data, error } = await supabase.functions.invoke('stripe-approve-refund', {
        body: { refund_request_id: requestId },
      });
      if (!error) return (data as { outcome?: ApprovalOutcome } | null)?.outcome ?? 'refunded';
      // Non-2xx surfaces as FunctionsHttpError; the code is in the body.
      let code: string | undefined;
      const context = (error as { context?: Response }).context;
      if (context) {
        try {
          code = (await context.json())?.error;
        } catch {
          // fall through to the generic message
        }
      }
      throw new Error(approvalErrorMessage(code));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: REFUND_REQUESTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: OPERATOR_ALERTS_QUERY_KEY });
    },
  });
}

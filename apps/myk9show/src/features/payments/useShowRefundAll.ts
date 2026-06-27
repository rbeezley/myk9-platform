/**
 * Invokes the bulk make-whole show-cancellation refund (stripe-refund-show).
 * Refunds every online-paid entry for the show IN FULL (entry fee + service
 * fees) by refunding each PaymentIntent in full, then returns a per-result
 * summary. Offline-paid / already-refunded / cross-show entries are skipped and
 * listed for manual handling. The server is authoritative on authz + payout
 * state; this just surfaces the outcome.
 *
 * See docs/plan-refund-policy-withdrawal.md (Phase 4 — Show cancellation).
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ShowRefundAllResult {
  refunded: Array<{ paymentIntentId: string; amountCents: number; entryIds: string[] }>;
  skipped: Array<{ entryId: string; reason: string }>;
  failed: Array<{ paymentIntentId: string; entryIds: string[]; error: string }>;
  summary: {
    intentsRefunded: number;
    entriesRefunded: number;
    skipped: number;
    failed: number;
  };
}

// Server returns these top-level error codes (422); map to language a secretary
// can act on. Mirrors RefundEntryDialog's mapping for the shared payout codes.
const ERROR_MESSAGES: Record<string, string> = {
  payout_already_sent:
    'This show’s entry fees were already paid out to the club — settle refunds with the club directly.',
  payout_in_progress: 'A payout to the club is in flight — try again after it completes.',
};

export function useShowRefundAll() {
  return useMutation<ShowRefundAllResult, Error, string>({
    mutationFn: async (showId: string) => {
      const { data, error } = await supabase.functions.invoke('stripe-refund-show', {
        body: { show_id: showId },
      });

      if (error) {
        let code: string | undefined;
        const context = (error as { context?: Response }).context;
        if (context) {
          try {
            code = (await context.json())?.error;
          } catch {
            // fall through to the generic message
          }
        }
        throw new Error(ERROR_MESSAGES[code ?? ''] ?? error.message ?? 'Bulk refund failed');
      }

      return data as ShowRefundAllResult;
    },
  });
}

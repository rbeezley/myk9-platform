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
import { ensureError } from '@myk9/core';
import { logger } from '@/services/LoggingService';
import { STEP_UP_REQUIRED_CODE } from '@/features/step-up/stepUpFetch';

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
  [STEP_UP_REQUIRED_CODE]: 'No refunds were issued. Confirm your password to continue.',
  payout_already_sent:
    'This show’s entry fees were already paid out to the club, so bulk refunds can’t be issued from here. They are still possible: contact the site operator, who issues them manually and recovers the club’s share.',
  payout_in_progress: 'A payout to the club is in flight. Try again after it completes.',
  show_not_cancelled: 'Mark the show cancelled before refunding all entries.',
  // The lock is taken before any refund, so on these two nothing was refunded.
  money_operation_in_progress:
    'Another payout or refund is already running for this show. Try again in a moment.',
  money_lock_failed: 'We could not safely start the refunds. Try again in a moment.',
  refund_failed:
    'The bulk refund could not be completed. Run it again: completed refunds are never repeated.',
};

// MYK9-1824: any other failure, including a lost connection. stripe-refund-show
// refunds payment by payment, so a failure can come after some refunds went through.
// A re-run reuses each payment's live show refund instead of making a second one
// (findReusableShowRefund), and already-refunded entries are skipped.
const REFUND_ALL_UNCONFIRMED =
  'We could not finish refunding all entries. Some refunds may already have gone through. Run Refund all again: it will not refund anyone twice.';

/** The only error useShowRefundAll throws: its message is always plain copy. */
export class ShowRefundAllError extends Error {}

/** What to tell the secretary when Refund all fails. Never the server's own text. */
export function showRefundAllErrorMessage(err: unknown): string {
  if (err instanceof ShowRefundAllError) return err.message;
  logger.error('Refund all failed', 'secretary', {}, ensureError(err));
  return REFUND_ALL_UNCONFIRMED;
}

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
        const known = ERROR_MESSAGES[code ?? ''];
        if (!known) logger.error('Refund all failed', 'secretary', { code }, error);
        throw new ShowRefundAllError(known ?? REFUND_ALL_UNCONFIRMED);
      }

      return data as ShowRefundAllResult;
    },
  });
}

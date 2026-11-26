/**
 * What to do when Stripe Checkout has not redirected after "Pay" (MYK9-2336). Pure, so the rule is
 * unit tested without a browser or Stripe. The only input is what Stripe says about the Checkout
 * Session; the page's DOM is never consulted for the decision.
 *
 * Since Stripe API 2022-08-30 a payment-mode session has no PaymentIntent until the payer confirms,
 * so "no intent" on an open, unpaid session means nothing was confirmed: the click was dropped.
 */

export type PaymentEvidence =
  /** The read failed or timed out: it proves nothing. */
  | { read: 'failed' }
  | {
      read: 'ok';
      /** Checkout Session status: open, complete or expired. */
      sessionStatus: string | null;
      /** Checkout Session payment_status: unpaid, paid or no_payment_required. */
      paymentStatus: string | null;
      /** PaymentIntent status; null when the session has no intent yet. */
      paymentIntentStatus: string | null;
    };

export type PayFollowUp = 'wait' | 'retry' | 'fail';

/**
 * - wait: the read failed, or Stripe has the payment complete, paid or in flight; the redirect may
 *   only be late. Never click.
 * - retry: the session is open and nothing was confirmed (no intent, or an unstarted one), so the
 *   click was dropped. One more click is safe; a session can complete only once.
 * - fail: expired, or any other state; never click.
 */
export function decidePayFollowUp(evidence: PaymentEvidence): PayFollowUp {
  if (evidence.read === 'failed') return 'wait';
  if (evidence.sessionStatus === 'complete' || evidence.paymentStatus === 'paid') return 'wait';
  if (evidence.sessionStatus !== 'open') return 'fail';
  switch (evidence.paymentIntentStatus) {
    case null:
      return evidence.paymentStatus === 'unpaid' ? 'retry' : 'fail';
    case 'requires_payment_method':
    case 'requires_confirmation':
      return 'retry';
    case 'processing':
    case 'succeeded':
      return 'wait';
    default:
      return 'fail';
  }
}

/** A short label for logs and failure messages. */
export function describeEvidence(evidence: PaymentEvidence): string {
  if (evidence.read === 'failed') return 'unreadable';
  return `session ${evidence.sessionStatus ?? 'unknown'}/${evidence.paymentStatus ?? 'unknown'}, PI ${evidence.paymentIntentStatus ?? 'none'}`;
}

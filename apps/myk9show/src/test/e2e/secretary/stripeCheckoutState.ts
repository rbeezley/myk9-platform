/**
 * What to do when Stripe Checkout has not redirected after "Pay" (MYK9-2336). Pure, so the rule is
 * unit tested without a browser or Stripe. The only input is the Checkout Session's PaymentIntent
 * status, read from Stripe; the page's DOM is never consulted for the decision.
 */

export interface PaymentEvidence {
  /** Stripe's PaymentIntent status for the Checkout Session; null when missing or unreadable. */
  paymentIntentStatus: string | null;
}

export type PayFollowUp = 'wait' | 'retry' | 'fail';

/**
 * - wait: Stripe has the payment in flight or done, or could not be read (null: a failed read
 *   proves nothing); the redirect may only be late. Never click.
 * - retry: Stripe shows the payment unstarted, so the click was dropped. One more click is safe.
 * - fail: a status that was read and is neither in flight nor unstarted (canceled, needs action); never click.
 */
export function decidePayFollowUp(evidence: PaymentEvidence): PayFollowUp {
  switch (evidence.paymentIntentStatus) {
    case null:
    case 'processing':
    case 'succeeded':
      return 'wait';
    case 'requires_payment_method':
    case 'requires_confirmation':
      return 'retry';
    default:
      return 'fail';
  }
}

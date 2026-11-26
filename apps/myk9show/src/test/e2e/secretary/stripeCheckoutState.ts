/**
 * What a Stripe Checkout page looks like after "Pay" was clicked and no redirect came (MYK9-2336).
 * Pure, so the classification and the retry rule are unit tested without a browser or Stripe.
 */

export interface CheckoutSnapshot {
  /** The Pay button is disabled or aria-busy. */
  payBusy: boolean;
  /** A spinner, progressbar or aria-busy region is visible. */
  spinnerShown: boolean;
  /** Visible validation or error text, trimmed; null when there is none. */
  errorText: string | null;
  /** A Link modal, dialog or OTP frame is open over the form. */
  linkOverlay: boolean;
  /** Focus sits in the Email field (Link's email lookup can take it back). */
  emailFocused: boolean;
}

export type CheckoutState =
  'processing' | 'validation-error' | 'link-takeover' | 'link-focus' | 'idle';

/** Order matters: an error or an overlay explains a silent page better than a stale spinner. */
export function classifyCheckout(snapshot: CheckoutSnapshot): CheckoutState {
  if (snapshot.errorText) return 'validation-error';
  if (snapshot.linkOverlay) return 'link-takeover';
  if (snapshot.payBusy || snapshot.spinnerShown) return 'processing';
  if (snapshot.emailFocused) return 'link-focus';
  return 'idle';
}

export interface PaymentEvidence {
  /** Stripe's PaymentIntent status for the Checkout Session; null when missing or unreadable. */
  paymentIntentStatus: string | null;
}

/**
 * Positive evidence that nothing was charged, so the form may be submitted again. A missing
 * intent, 'processing', 'succeeded' or a failed read all mean never click again.
 */
export function confirmedUnpaid(evidence: PaymentEvidence): boolean {
  return (
    evidence.paymentIntentStatus === 'requires_payment_method' ||
    evidence.paymentIntentStatus === 'requires_confirmation'
  );
}

export function describeCheckoutState(state: CheckoutState, snapshot: CheckoutSnapshot): string {
  switch (state) {
    case 'processing':
      return 'still processing (spinner or busy Pay button)';
    case 'validation-error':
      return `a validation error is shown: "${snapshot.errorText}"`;
    case 'link-takeover':
      return 'Link took over (a Link modal or code frame is open)';
    case 'link-focus':
      return 'idle with focus back on Email (Link email lookup may have swallowed the click)';
    case 'idle':
      return 'idle (no spinner, no error, no overlay)';
  }
}

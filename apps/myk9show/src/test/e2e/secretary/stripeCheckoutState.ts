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

/** Only a page that is quiet may be clicked again; processing, errors and Link are never retried. */
export function mayRetryPay(state: CheckoutState): boolean {
  return state === 'idle' || state === 'link-focus';
}

export interface PaymentEvidence {
  /** `entry_payment_links.status`; anything but 'open' means a payment landed. */
  linkStatus: string | null;
  /** Stripe's `payment_status` for the Checkout Session; null when it could not be read. */
  sessionPaymentStatus: string | null;
}

/** True only when we positively know nothing was paid. Unknown evidence means never retry. */
export function confirmedUnpaid(evidence: PaymentEvidence): boolean {
  return evidence.linkStatus === 'open' && evidence.sessionPaymentStatus === 'unpaid';
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

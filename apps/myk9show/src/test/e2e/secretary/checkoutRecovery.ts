/**
 * MYK9-2336: what the wait-list journey does when Stripe's hosted Checkout does not redirect after
 * "Pay". Pure, with no Playwright import, so vitest can test it
 * (src/test/qa/checkoutRecovery.test.ts); waitlistStripe.ts inspects the page and the session and
 * calls it.
 *
 * One run on main filled the form, clicked Pay and saw no redirect for 90s, with no visible error.
 * The causes look alike from the test's side and need different answers, so the helper names the
 * one it saw. The one rule that matters: it never clicks Pay a second time unless Stripe says the
 * session is still open and unpaid AND the page is idle, so it can never pay twice.
 */

/** What the Checkout page showed once the redirect failed to come. */
export type CheckoutPageState =
  | { kind: 'validation-error'; message: string }
  | { kind: 'processing' }
  | { kind: 'link-prompt' }
  | { kind: 'idle' };

/** The Checkout Session as Stripe reports it; null when the lookup itself failed. */
export interface StripeSessionStatus {
  /** `open`, `complete` or `expired`. */
  status: string;
  /** `paid`, `unpaid` or `no_payment_required`. */
  payment_status: string;
}

export type RecoveryDecision =
  | { action: 'wait'; reason: string }
  | { action: 'retry'; reason: string }
  | { action: 'fail'; reason: string };

export function decideAfterSilence(
  page: CheckoutPageState,
  session: StripeSessionStatus | null
): RecoveryDecision {
  if (!session) {
    return {
      action: 'fail',
      reason:
        'the Stripe session could not be read, so a second Pay click was not risked (it could pay twice)',
    };
  }
  if (session.status === 'complete' || session.payment_status === 'paid') {
    return {
      action: 'wait',
      reason: 'Stripe already took the payment; only the redirect to the app is missing',
    };
  }
  if (session.status === 'expired') {
    return { action: 'fail', reason: 'the Stripe Checkout Session expired before it was paid' };
  }
  switch (page.kind) {
    case 'processing':
      return { action: 'wait', reason: 'Stripe Checkout is still processing the payment' };
    case 'validation-error':
      return { action: 'fail', reason: `Stripe Checkout showed an error: ${page.message}` };
    case 'link-prompt':
      return { action: 'fail', reason: 'Stripe Link took over the page and is asking for a code' };
    case 'idle':
      return {
        action: 'retry',
        reason: 'the page sat idle with the session still open and unpaid, so the click was lost',
      };
  }
}

/** Page text that means Link is asking the payer to verify rather than paying. */
export const LINK_PROMPT_PATTERN =
  /(enter|verification) (the |your )?(6-digit )?code|log in to link|continue with link/i;

/** Page text that means the submit is in flight. */
export const PROCESSING_PATTERN = /\bprocessing\b/i;

// Operator alert copy for money the platform OWES (Codex round 10 on #2689).
// Deno-free; refundRequests.ts and stripe-webhook build these alerts here so
// one declared list (REFUND_ALERT_BUILDERS) can be swept by a test.
//
// RULE: the approval queue is the only way a queued refund leaves the
// platform. No alert here may tell an operator to refund from the Stripe
// dashboard or "by hand": a dashboard refund carries no request metadata, so
// if a request exists (or is created later by a redelivery) an approval
// would refund the same money again. When nothing could be queued, the copy
// says how to get it INTO the queue; when money already moved, it points to
// Resolve without refund.

export interface AlertCopy {
  title: string;
  html: string;
}

const DO_NOT_REFUND_IN_DASHBOARD =
  'Do NOT refund it from the Stripe dashboard: a dashboard refund carries no request, so an approval could refund the same money again.';

const QUEUE_IT_BY_HAND =
  'Once the amount is known, queue it with <code>queue_payment_link_refund</code> (service role: session, payment intent, amount, reason) so it appears under <strong>Refunds awaiting approval</strong> on /admin/health, then approve it there.';

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** A refund is owed but the payment intent or amount is missing, so nothing was queued. */
export function queueMissingInputsAlert(input: {
  summaryHtml: string;
  sessionId: string;
  paymentIntentId: string | null;
  amountCents: number | null;
}): AlertCopy {
  return {
    title: 'Refund owed but not queued: payment intent or amount missing',
    html: `<p>${input.summaryHtml}</p>
     <p>A refund is owed for Checkout Session <code>${input.sessionId}</code>, but the
     payment intent or amount is missing (payment intent
     <code>${input.paymentIntentId ?? 'unknown'}</code>, amount
     <code>${input.amountCents ?? 'unknown'}</code>), so nothing was queued.</p>
     <p>${DO_NOT_REFUND_IN_DASHBOARD} ${QUEUE_IT_BY_HAND}</p>`,
  };
}

/** The idempotent queue write could not be confirmed after retries and a re-read. */
export function queueUnconfirmedAlert(input: {
  summaryHtml: string;
  kind: string;
  sessionId: string;
  paymentIntentId: string;
  amountCents: number;
  reason: string;
  message: string;
}): AlertCopy {
  return {
    title: 'Queueing a refund could not be confirmed — Stripe will retry',
    html: `<p>${input.summaryHtml}</p>
     <p>${dollars(input.amountCents)} USD is owed on payment intent
     <code>${input.paymentIntentId}</code> (session <code>${input.sessionId}</code>, kind
     <code>${input.kind}</code>, reason <code>${input.reason}</code>), but queueing it for
     approval could not be confirmed:</p>
     <pre>${input.message}</pre>
     <p>The webhook answered with an error, so Stripe will redeliver the event and the
     idempotent queue write runs again. ${DO_NOT_REFUND_IN_DASHBOARD} If this persists,
     check the <strong>Refunds awaiting approval</strong> card on /admin/health for this
     session before doing anything else.</p>`,
  };
}

/** A paid abandoned cart with no payment intent or amount: nothing was queued. */
export function abandonedCartMissingInputsAlert(input: {
  sessionId: string;
  cartId: string;
}): AlertCopy {
  return {
    title: 'Paid abandoned cart not queued: payment intent or amount missing',
    html: `<p>Checkout session <code>${input.sessionId}</code> was PAID after cart
     <code>${input.cartId}</code> was abandoned, but the payment intent or amount is
     missing, so no refund request was queued and no entries were created.</p>
     <p>${DO_NOT_REFUND_IN_DASHBOARD} ${QUEUE_IT_BY_HAND}</p>`,
  };
}

// MYK9-964: a cart_overflow request is added to a checkout whose latch already
// closed by calling complete_cart_fulfillment again. It keeps the order it
// finds and inserts the request, idempotent on (session, kind).
const QUEUE_CART_OVERFLOW_BY_HAND =
  'Once the amount is known, queue it with <code>complete_cart_fulfillment</code> (service role: the session, its existing <code>stripe_orders</code> row as <code>to_jsonb(o)</code>, the amount, reason <code>partial_no_service_lines</code>) so it appears under <strong>Refunds awaiting approval</strong> on /admin/health, then approve it there.';

/** Unserved cart lines whose refundable amount could not be derived: nothing was queued. */
export function overflowNeedsManualAmountAlert(input: {
  sessionId: string;
  invalidCartItemIds: string[];
  missingLineIds: string[];
}): AlertCopy {
  return {
    title: 'Cart overflow refund needs a manual amount',
    html: `<p>Session <code>${input.sessionId}</code> has no-service cart items
     <code>${input.invalidCartItemIds.join(', ') || 'none'}</code>, but the webhook could not
     derive their refundable amount (lines
     <code>${input.missingLineIds.join(', ') || 'none'}</code>), so nothing was queued. The
     lines it could serve are recorded and the checkout is closed.</p>
     <p>Work out the no-service lines' entry fees (never any of the service fee, MYK9-966).
     ${DO_NOT_REFUND_IN_DASHBOARD} ${QUEUE_CART_OVERFLOW_BY_HAND}</p>`,
  };
}

/** Unserved cart lines with no payment intent or charged amount: nothing was queued. */
export function cartOverflowCannotRefundAlert(input: {
  sessionId: string;
  invalidCartItemIds: string[];
  reason: string;
}): AlertCopy {
  return {
    title: 'Cart overflow refund could not be queued',
    html: `<p>Session <code>${input.sessionId}</code> has no-service cart items
     <code>${input.invalidCartItemIds.join(', ') || 'none'}</code>, but no refund could be
     queued: <code>${input.reason}</code>. The lines it could serve are recorded and the
     checkout is closed.</p>
     <p>Find the payment in Stripe from the session. ${DO_NOT_REFUND_IN_DASHBOARD}
     ${QUEUE_CART_OVERFLOW_BY_HAND}</p>`,
  };
}

/** Payment-link entries that could not be honored, whose fees could not be derived. */
export function paymentLinkNeedsManualAmountAlert(input: {
  sessionId: string;
  invalidEntryIds: string[];
  missingFeeEntryIds: string[];
}): AlertCopy {
  return {
    title: 'Payment link refund needs a manual amount',
    html: `<p>Session <code>${input.sessionId}</code> was PAID and has invalid entries
     <code>${input.invalidEntryIds.join(', ')}</code>, but the webhook could not derive
     fees for <code>${input.missingFeeEntryIds.join(', ')}</code>, so nothing was
     queued.</p>
     <p>Work out the invalid entries' fees (never any of the service fee, MYK9-966).
     ${DO_NOT_REFUND_IN_DASHBOARD} ${QUEUE_IT_BY_HAND}</p>`,
  };
}

/**
 * True when text tells an operator to refund outside the approval queue
 * ("refund by hand", "refund it from the Stripe dashboard", ...). A sentence
 * that forbids it ("Do NOT refund it from the Stripe dashboard") is fine.
 */
// "refund" + an optional object of up to three words ("it", "that amount",
// "the no-service portion") + an outside-the-queue way. "Check the refund in
// Stripe" has no object before "in" and so is not an instruction.
const MANUAL_REFUND_INSTRUCTION =
  /\brefund(?: (?:it|them|that|this|the|a)(?: [\w-]+){0,2})? (?:by hand|manually|from (?:the )?stripe|in the stripe dashboard)|dashboard refund is the complete fix/i;

export function instructsManualRefund(text: string): boolean {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .split(/[.!?] /)
    .some(sentence => MANUAL_REFUND_INSTRUCTION.test(sentence) && !/\bdo not\b/i.test(sentence));
}

/**
 * The declared list the copy sweep test runs: every builder above, with
 * sample input. Adding a builder without listing it here fails that test.
 */
export const REFUND_ALERT_BUILDERS: Record<string, () => AlertCopy> = {
  queueMissingInputsAlert: () =>
    queueMissingInputsAlert({
      summaryHtml: 'Summary.',
      sessionId: 'cs_1',
      paymentIntentId: null,
      amountCents: null,
    }),
  queueUnconfirmedAlert: () =>
    queueUnconfirmedAlert({
      summaryHtml: 'Summary.',
      kind: 'entry_payment_link',
      sessionId: 'cs_1',
      paymentIntentId: 'pi_1',
      amountCents: 1500,
      reason: 'partial_invalid_entries',
      message: 'timeout',
    }),
  abandonedCartMissingInputsAlert: () =>
    abandonedCartMissingInputsAlert({ sessionId: 'cs_1', cartId: 'cart-1' }),
  paymentLinkNeedsManualAmountAlert: () =>
    paymentLinkNeedsManualAmountAlert({
      sessionId: 'cs_1',
      invalidEntryIds: ['e-1'],
      missingFeeEntryIds: ['e-1'],
    }),
  overflowNeedsManualAmountAlert: () =>
    overflowNeedsManualAmountAlert({
      sessionId: 'cs_1',
      invalidCartItemIds: ['ci-1'],
      missingLineIds: ['ci-1'],
    }),
  cartOverflowCannotRefundAlert: () =>
    cartOverflowCannotRefundAlert({
      sessionId: 'cs_1',
      invalidCartItemIds: ['ci-1'],
      reason: 'missing_payment_intent',
    }),
};

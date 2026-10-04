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

const CART_OVERFLOW_BY_HAND =
  'The app will NOT refund this: cart-overflow refunds are handled by hand until MYK9-964 makes them atomic with the cart latch. No refund request exists or can be created for it, so a dashboard refund cannot be doubled by an approval.';

/**
 * ALLOWED MANUAL REFUND (Codex round 13 on #2689, option C): paid cart lines
 * the class could not take. The amount is known only after the cart latch
 * closed, so it cannot be queued atomically; the operator confirms and
 * refunds that exact amount in the Stripe dashboard.
 */
export function cartOverflowManualRefundAlert(input: {
  sessionId: string;
  paymentIntentId: string | null;
  amountCents: number;
  reason: string;
  waitlistedCartItemIds: string[];
  deniedCartItemIds: string[];
  failedCartItemIds: string[];
}): AlertCopy {
  const list = (ids: string[]) => (ids.length ? `<code>${ids.join(', ')}</code>` : 'none');
  return {
    title: 'Cart overflow — refund by hand',
    html: `<p>Checkout session <code>${input.sessionId}</code> (payment intent
     <code>${input.paymentIntentId ?? 'unknown'}</code>) was PAID for cart lines the classes
     could not take: waitlisted ${list(input.waitlistedCartItemIds)}, denied
     ${list(input.deniedCartItemIds)}, failed ${list(input.failedCartItemIds)}
     (reason <code>${input.reason}</code>).</p>
     <p>${(input.amountCents / 100).toFixed(2)} USD is owed back. Once you have confirmed
     the lines above, refund exactly that amount from the Stripe dashboard on this payment
     intent. ${CART_OVERFLOW_BY_HAND}</p>
     <p>The reconciliation report will show it as a post-hoc refund until MYK9-964. The
     club's payout is unaffected: payouts are computed from accepted entries, and these
     lines never became entries.</p>`,
  };
}

/**
 * ALLOWED MANUAL REFUND: cart-overflow lines whose collected amount could not
 * be derived (same reason as cartOverflowManualRefundAlert).
 */
export function overflowNeedsManualAmountAlert(input: {
  sessionId: string;
  invalidCartItemIds: string[];
  missingLineIds: string[];
}): AlertCopy {
  return {
    title: 'Cart overflow refund needs a manual amount — refund by hand',
    html: `<p>Session <code>${input.sessionId}</code> has no-service cart items
     <code>${input.invalidCartItemIds.join(', ')}</code>, but the webhook could not
     derive collected line amounts for <code>${input.missingLineIds.join(', ')}</code>.</p>
     <p>Work out the no-service lines' entry fees (never any of the service fee, MYK9-966),
     then refund that amount from the Stripe dashboard. ${CART_OVERFLOW_BY_HAND}</p>`,
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
};

/**
 * The declared EXCEPTIONS: builders that DO tell the operator to refund in the
 * Stripe dashboard, each with the reason that is safe. Same treatment as the
 * MYK9-963 full-charge alerts in stripe-webhook. The sweep test requires each
 * to instruct a manual refund, say the app will not refund it, and name
 * MYK9-964.
 */
export const ALLOWED_MANUAL_REFUND_ALERTS: Record<
  string,
  { reason: string; build: () => AlertCopy }
> = {
  cartOverflowManualRefundAlert: {
    reason:
      'Cart overflow is never queued (option C): no refund request can exist for it, so a dashboard refund cannot be doubled by an approval. MYK9-964 makes it atomic.',
    build: () =>
      cartOverflowManualRefundAlert({
        sessionId: 'cs_1',
        paymentIntentId: 'pi_1',
        amountCents: 2500,
        reason: 'partial_no_service_lines',
        waitlistedCartItemIds: ['ci-1'],
        deniedCartItemIds: ['ci-2'],
        failedCartItemIds: [],
      }),
  },
  overflowNeedsManualAmountAlert: {
    reason: 'The same cart-overflow money, when its amount could not be derived.',
    build: () =>
      overflowNeedsManualAmountAlert({
        sessionId: 'cs_1',
        invalidCartItemIds: ['ci-1'],
        missingLineIds: ['ci-1'],
      }),
  },
};

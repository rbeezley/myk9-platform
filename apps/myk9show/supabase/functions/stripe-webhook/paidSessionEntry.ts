// The ONE entry decision for checkout.session.completed /
// async_payment_succeeded (Codex rounds 11, 13 and 15 on #2689). Pure, so the
// ordering is unit-tested; index.ts supplies the lookups and handlers.
//
// INVARIANT: before ANY first-time validation (cart lookup, expiry, pricing,
// link state, claims), the session's durable records are read: its refund
// request(s) and its stripe_orders row. If either exists, this delivery is a
// redelivery or a duplicate, and it runs NO first-time validation. Otherwise
// a cart deleted since, a cart that expired, or changed pricing would raise
// false "refund this charge" alerts for money already queued or fulfilled.
//   * a refund request exists: ensure the alert of each OPEN one (pending,
//     awaiting_stripe, failed); a closed one (refunded, resolved without
//     refund) gets nothing. Return 2xx.
//   * an order exists: already fulfilled; return 2xx.
//   * neither: first-time fulfillment.
// A failed lookup throws (5xx, no writes) and Stripe redelivers.

/** Checkout types that fulfill entries and record a stripe_orders row. */
export const FULFILLMENT_CHECKOUT_TYPES: ReadonlySet<string> = new Set([
  'entry',
  'entry_payment_request',
]);

export type PaidSessionEntry =
  | 'refund_requested'
  | 'already_fulfilled'
  | 'fulfill_cart'
  | 'fulfill_payment_link'
  | 'subscription'
  | 'unexpected_payment'
  | 'ignore';

/** Whether the entry decision needs the session's durable records. */
export function needsOrderLookup(checkoutType: string | undefined): boolean {
  return checkoutType !== undefined && FULFILLMENT_CHECKOUT_TYPES.has(checkoutType);
}

export function decidePaidSessionEntry(input: {
  checkoutType: string | undefined;
  mode: string | null;
  orderExists: boolean;
  /** Statuses of the session's refund requests (empty: none). */
  requestStatuses?: string[];
}): PaidSessionEntry {
  if (needsOrderLookup(input.checkoutType)) {
    if ((input.requestStatuses ?? []).length > 0) return 'refund_requested';
    if (input.orderExists) return 'already_fulfilled';
    return input.checkoutType === 'entry' ? 'fulfill_cart' : 'fulfill_payment_link';
  }
  if (input.mode === 'subscription') return 'subscription';
  if (input.mode === 'payment') return 'unexpected_payment';
  return 'ignore';
}

export interface PaidSessionHandlers<Request extends { status: string }> {
  /** The session's refund requests. Throws when they cannot be read. */
  findRequests: () => Promise<Request[]>;
  /** Whether the session has a stripe_orders row. Throws when it cannot be read. */
  orderExists: () => Promise<boolean>;
  /** A redelivery with refund request(s): ensure the alert of each OPEN one. */
  refundRequested: (requests: Request[]) => Promise<void>;
  /** A redelivery of a fulfilled session with no refund request. */
  alreadyFulfilled: (checkoutType: string) => Promise<void>;
  /** First-time fulfillment, with all its validation (cart, expiry, pricing, claims). */
  fulfillCart: () => Promise<void>;
  /** First-time fulfillment of a payment link (link state, reconcile, latch). */
  fulfillPaymentLink: () => Promise<void>;
  subscription: () => Promise<void>;
  unexpectedPayment: () => void;
}

/** Read the session's durable records, decide, and run exactly one handler. */
export async function routePaidSession<Request extends { status: string }>(
  session: { checkoutType: string | undefined; mode: string | null },
  handlers: PaidSessionHandlers<Request>
): Promise<PaidSessionEntry> {
  const lookup = needsOrderLookup(session.checkoutType);
  const requests = lookup ? await handlers.findRequests() : [];
  const orderExists = lookup ? await handlers.orderExists() : false;
  const entry = decidePaidSessionEntry({
    checkoutType: session.checkoutType,
    mode: session.mode,
    orderExists,
    requestStatuses: requests.map(r => r.status),
  });
  if (entry === 'refund_requested') await handlers.refundRequested(requests);
  else if (entry === 'already_fulfilled')
    await handlers.alreadyFulfilled(session.checkoutType ?? '');
  else if (entry === 'fulfill_cart') await handlers.fulfillCart();
  else if (entry === 'fulfill_payment_link') await handlers.fulfillPaymentLink();
  else if (entry === 'subscription') await handlers.subscription();
  else if (entry === 'unexpected_payment') handlers.unexpectedPayment();
  return entry;
}

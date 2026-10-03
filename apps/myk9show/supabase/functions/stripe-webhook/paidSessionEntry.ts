// The ONE entry decision for checkout.session.completed /
// async_payment_succeeded (Codex round 11 on #2689). Pure, so the ordering is
// unit-tested; index.ts reads the order row and acts on the answer.
//
// INVARIANT: if a stripe_orders row already exists for the session, the
// session was fulfilled before, and this delivery is a redelivery (or a
// duplicate). It replays the idempotent refund-queue write from that order
// and returns 2xx, BEFORE any first-time validation runs: cart lookup,
// expiry, pricing, link state and the fulfillment claims are only ever
// evaluated when no order exists. Otherwise a retry that arrives after the
// cart expired or the show's pricing changed would fail validation, return
// early, and never queue the refund it owes.

/** Checkout types that fulfill entries and record a stripe_orders row. */
export const FULFILLMENT_CHECKOUT_TYPES: ReadonlySet<string> = new Set([
  'entry',
  'entry_payment_request',
]);

export type PaidSessionEntry =
  | 'replay_recorded_order'
  | 'fulfill_cart'
  | 'fulfill_payment_link'
  | 'subscription'
  | 'unexpected_payment'
  | 'ignore';

/** Whether the entry decision needs to know if an order already exists. */
export function needsOrderLookup(checkoutType: string | undefined): boolean {
  return checkoutType !== undefined && FULFILLMENT_CHECKOUT_TYPES.has(checkoutType);
}

export function decidePaidSessionEntry(input: {
  checkoutType: string | undefined;
  mode: string | null;
  orderExists: boolean;
}): PaidSessionEntry {
  if (needsOrderLookup(input.checkoutType)) {
    if (input.orderExists) return 'replay_recorded_order';
    return input.checkoutType === 'entry' ? 'fulfill_cart' : 'fulfill_payment_link';
  }
  if (input.mode === 'subscription') return 'subscription';
  if (input.mode === 'payment') return 'unexpected_payment';
  return 'ignore';
}

export interface PaidSessionHandlers<Order> {
  /** The session's stripe_orders row, or null. Throws when it cannot be read. */
  loadRecordedOrder: () => Promise<Order | null>;
  /** Redelivery: replay the idempotent refund-queue write from the order. */
  replay: (order: Order) => Promise<void>;
  /** First-time fulfillment, with all its validation (cart, expiry, pricing, claims). */
  fulfillCart: () => Promise<void>;
  /** First-time fulfillment of a payment link (link state, reconcile, latch). */
  fulfillPaymentLink: () => Promise<void>;
  subscription: () => Promise<void>;
  unexpectedPayment: () => void;
}

/**
 * Look up the order, decide, and run exactly one handler. Replay happens
 * before, and instead of, every first-time validation.
 */
export async function routePaidSession<Order>(
  session: { checkoutType: string | undefined; mode: string | null },
  handlers: PaidSessionHandlers<Order>
): Promise<PaidSessionEntry> {
  const recorded = needsOrderLookup(session.checkoutType)
    ? await handlers.loadRecordedOrder()
    : null;
  const entry = decidePaidSessionEntry({
    checkoutType: session.checkoutType,
    mode: session.mode,
    orderExists: recorded !== null,
  });
  if (entry === 'replay_recorded_order' && recorded !== null) await handlers.replay(recorded);
  else if (entry === 'fulfill_cart') await handlers.fulfillCart();
  else if (entry === 'fulfill_payment_link') await handlers.fulfillPaymentLink();
  else if (entry === 'subscription') await handlers.subscription();
  else if (entry === 'unexpected_payment') handlers.unexpectedPayment();
  return entry;
}

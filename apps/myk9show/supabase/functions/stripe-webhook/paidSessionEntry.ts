// The ONE entry decision for checkout.session.completed /
// async_payment_succeeded (Codex rounds 11 and 13 on #2689). Pure, so the
// ordering is unit-tested; index.ts supplies the order lookup and handlers.
//
// INVARIANT: if a stripe_orders row already exists for the session, the
// session was fulfilled before and this delivery is a redelivery or a
// duplicate. It runs NO first-time validation (cart lookup, expiry, pricing,
// link state, claims): a retry after the cart expired or the pricing
// changed would otherwise raise false "refund this charge" alerts, and a
// payment link deleted since would look like a paid session with no link.
// It only ensures the alert of any refund request the session already has
// (the request itself was written atomically with the fulfillment latch).

/** Checkout types that fulfill entries and record a stripe_orders row. */
export const FULFILLMENT_CHECKOUT_TYPES: ReadonlySet<string> = new Set([
  'entry',
  'entry_payment_request',
]);

export type PaidSessionEntry =
  | 'already_fulfilled'
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
    if (input.orderExists) return 'already_fulfilled';
    return input.checkoutType === 'entry' ? 'fulfill_cart' : 'fulfill_payment_link';
  }
  if (input.mode === 'subscription') return 'subscription';
  if (input.mode === 'payment') return 'unexpected_payment';
  return 'ignore';
}

export interface PaidSessionHandlers {
  /** Whether the session has a stripe_orders row. Throws when it cannot be read. */
  orderExists: () => Promise<boolean>;
  /** A redelivery: ensure the alert of any refund request the session has. */
  alreadyFulfilled: (checkoutType: string) => Promise<void>;
  /** First-time fulfillment, with all its validation (cart, expiry, pricing, claims). */
  fulfillCart: () => Promise<void>;
  /** First-time fulfillment of a payment link (link state, reconcile, latch). */
  fulfillPaymentLink: () => Promise<void>;
  subscription: () => Promise<void>;
  unexpectedPayment: () => void;
}

/** Look up the order, decide, and run exactly one handler. */
export async function routePaidSession(
  session: { checkoutType: string | undefined; mode: string | null },
  handlers: PaidSessionHandlers
): Promise<PaidSessionEntry> {
  const orderExists = needsOrderLookup(session.checkoutType) ? await handlers.orderExists() : false;
  const entry = decidePaidSessionEntry({
    checkoutType: session.checkoutType,
    mode: session.mode,
    orderExists,
  });
  if (entry === 'already_fulfilled') await handlers.alreadyFulfilled(session.checkoutType ?? '');
  else if (entry === 'fulfill_cart') await handlers.fulfillCart();
  else if (entry === 'fulfill_payment_link') await handlers.fulfillPaymentLink();
  else if (entry === 'subscription') await handlers.subscription();
  else if (entry === 'unexpected_payment') handlers.unexpectedPayment();
  return entry;
}

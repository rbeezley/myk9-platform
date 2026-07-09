// Pure decision shared by both entry payment paths that re-retrieve a
// Checkout Session fresh from Stripe before trusting it (MP-05 cart
// checkout's handleEntryPaymentCompleted, MP-07 payment link's
// handleEntryPaymentRequestCompleted). The webhook's OWN event payload is
// untrusted: Stripe delivers checkout.session.completed for delayed/async
// payment methods with payment_status='unpaid' (the
// checkout.session.async_payment_succeeded event redrives the same handler
// once money actually lands — see stripe-webhook/index.ts's event switch,
// which already routes both events to handleCheckoutCompleted), and a
// payload's amount_total can drift from the session's authoritative state
// (owner-writable cart totals, stale webhook redelivery, etc). Both handlers
// therefore call `stripe.checkout.sessions.retrieve(session.id)` and gate +
// price EXCLUSIVELY off that fresh result, never the payload.

export interface FreshCheckoutSessionLike {
  payment_status: string | null;
  amount_total: number | null;
}

export type FreshSessionGateDecision =
  { action: 'process'; amountTotalCents: number | null } | { action: 'skip'; reason: string };

export function decideFreshSessionGate(fresh: FreshCheckoutSessionLike): FreshSessionGateDecision {
  if (fresh.payment_status !== 'paid') {
    return {
      action: 'skip',
      reason: `session is ${fresh.payment_status ?? 'unknown'} after fresh retrieve`,
    };
  }
  return { action: 'process', amountTotalCents: fresh.amount_total ?? null };
}

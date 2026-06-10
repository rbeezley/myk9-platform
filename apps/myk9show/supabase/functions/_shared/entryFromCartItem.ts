// Pure helpers shared by stripe-webhook (Deno) and vitest. Keep this module
// free of Deno/npm imports so the colocated test runs under Node.

export interface CartItemForEntry {
  dog_id: string;
  class_id: string;
  handler_id: string | null;
  entry_fee_cents: number;
  jump_height: string | null;
  special_requests: string | null;
}

// The row stripe-webhook inserts into entries when a cart payment completes.
// Shape verified against the LIVE schema (migrations 003 + 20260518): entries
// store the fee as DECIMAL dollars (entry_fee — there is no entry_fee_cents
// column), free text goes to special_requests (no notes column), and
// payment_method='online' (no source column) is the discriminator the payout
// calc and refund validation key on. stripe_payment_intent_id is the
// per-entry refund key; NULL means not refundable through stripe-refund-entry.
export function buildEntryInsert(
  item: CartItemForEntry,
  paymentIntentId: string | null,
  submittedAt: string
) {
  return {
    dog_id: item.dog_id,
    class_id: item.class_id,
    handler_id: item.handler_id,
    entry_status: 'paid',
    payment_status: 'paid',
    entry_fee: item.entry_fee_cents / 100,
    jump_height: item.jump_height,
    special_requests: item.special_requests,
    payment_method: 'online',
    submitted_at: submittedAt,
    stripe_payment_intent_id: paymentIntentId,
  };
}

// checkout.session.completed normally carries the intent as a string id, but
// an expanded PaymentIntent object is also valid per Stripe's types.
export function extractPaymentIntentId(paymentIntent: unknown): string | null {
  if (typeof paymentIntent === 'string') return paymentIntent;
  if (
    paymentIntent !== null &&
    typeof paymentIntent === 'object' &&
    'id' in paymentIntent &&
    typeof (paymentIntent as { id: unknown }).id === 'string'
  ) {
    return (paymentIntent as { id: string }).id;
  }
  return null;
}

// Pure refund validation shared by stripe-refund-entry (Deno) and vitest.
// Keep this module free of Deno/npm imports so the colocated test runs under Node.

export interface RefundInput {
  entryFeeCents: number;
  /** Omitted = full refund of the entry fee. The platform fee is never refunded. */
  requestedCents?: number;
  paymentStatus: string;
  /** entries.payment_method — 'online' is the only Stripe-refundable value. */
  paymentMethod: string | null;
  stripePaymentIntentId: string | null;
  /** Status of the show's live payout row, or null when none exists. */
  payoutStatus: string | null;
}

export type RefundValidation = { amountCents: number } | { error: RefundError };

export type RefundError =
  | 'not_online_payment'
  | 'not_refundable'
  | 'missing_payment_intent'
  | 'payout_already_sent'
  | 'payout_in_progress'
  | 'amount_exceeds_fee'
  | 'invalid_amount';

// Order matters: entry-state checks first (clearest message for the
// secretary), then payout state, then amount math.
export function validateRefund(input: RefundInput): RefundValidation {
  if (input.paymentMethod !== 'online') return { error: 'not_online_payment' };
  if (input.paymentStatus !== 'paid') return { error: 'not_refundable' };
  if (!input.stripePaymentIntentId) return { error: 'missing_payment_intent' };
  if (input.payoutStatus === 'completed') return { error: 'payout_already_sent' };
  if (input.payoutStatus === 'processing') return { error: 'payout_in_progress' };

  const amountCents = input.requestedCents ?? input.entryFeeCents;
  if (!Number.isInteger(amountCents) || amountCents <= 0) return { error: 'invalid_amount' };
  if (amountCents > input.entryFeeCents) return { error: 'amount_exceeds_fee' };

  return { amountCents };
}

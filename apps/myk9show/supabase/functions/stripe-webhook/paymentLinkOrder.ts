// The stripe_orders row a paid payment-link session records (Codex round 14
// on #2689). Pure, so the columns are unit-tested. stripe-webhook passes it
// as `p_order` to queue_payment_link_refund, which inserts it in the SAME
// transaction as the link latch and the refund request (ON CONFLICT DO
// NOTHING when the order already exists). Same columns and values as the
// webhook's former direct insert.

import { buildOrderSnapshotFields, type OrderSnapshotFields } from '../_shared/orderSnapshot.ts';

export interface PaymentLinkOrderInput {
  sessionId: string;
  paymentIntentId: string | null;
  amountTotalCents: number | null;
  currency: string | null;
  linkId: string;
  showId: string | null;
  paidEntryIds: string[];
  entrySubtotalCents: number | null;
  platformFeeCents: number | null;
  platformFeeRate: number | null;
  stripeProcessingFeeCents: number | null;
  paidAt: string;
}

export type PaymentLinkOrder = OrderSnapshotFields & {
  customer_id: null;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string;
  amount_cents: number;
  currency: string;
  status: 'succeeded';
  order_type: 'entry';
  metadata: { entry_payment_link_id: string; entry_count: number };
  show_id: string | null;
  entry_ids: string[];
  paid_at: string;
};

export function buildPaymentLinkOrder(input: PaymentLinkOrderInput): PaymentLinkOrder {
  return {
    // customer_id is a UUID FK to stripe_customers(id) — NOT Stripe's cus_… id.
    // A link payer may have no stripe_customers row at all, so leave it null
    // (writing session.customer here threw an invalid-uuid error every time).
    customer_id: null,
    stripe_payment_intent_id: input.paymentIntentId,
    stripe_checkout_session_id: input.sessionId,
    amount_cents: input.amountTotalCents ?? 0,
    currency: input.currency || 'usd',
    status: 'succeeded',
    order_type: 'entry',
    ...buildOrderSnapshotFields({
      entrySubtotalCents: input.entrySubtotalCents,
      platformFeeCents: input.platformFeeCents,
      platformFeeRate: input.platformFeeRate,
      stripeProcessingFeeCents: input.stripeProcessingFeeCents,
    }),
    metadata: { entry_payment_link_id: input.linkId, entry_count: input.paidEntryIds.length },
    show_id: input.showId,
    entry_ids: input.paidEntryIds,
    paid_at: input.paidAt,
  };
}

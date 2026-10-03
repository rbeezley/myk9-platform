// @vitest-environment node
// The stripe_orders row a paid payment-link session passes to
// queue_payment_link_refund (Codex round 14 on #2689): the same columns and
// values the webhook used to insert directly.
import { describe, expect, it } from 'vitest';
import { buildPaymentLinkOrder } from './paymentLinkOrder';

/** The column list queue_payment_link_refund inserts, in the migration. */
const RPC_ORDER_COLUMNS = [
  'customer_id',
  'stripe_payment_intent_id',
  'stripe_checkout_session_id',
  'amount_cents',
  'currency',
  'status',
  'order_type',
  'entry_subtotal_cents',
  'platform_fee_cents',
  'platform_fee_rate',
  'stripe_processing_fee_cents',
  'refunded_cents',
  'make_whole_refunded_cents',
  'metadata',
  'show_id',
  'entry_ids',
  'paid_at',
];

describe('buildPaymentLinkOrder', () => {
  const input = {
    sessionId: 'cs_1',
    paymentIntentId: 'pi_1',
    amountTotalCents: 9630,
    currency: 'usd',
    linkId: 'link-1',
    showId: 'show-1',
    paidEntryIds: ['e-1', 'e-2'],
    entrySubtotalCents: 6000,
    platformFeeCents: 420,
    platformFeeRate: 7,
    stripeProcessingFeeCents: 309,
    paidAt: '2026-10-03T00:00:00.000Z',
  };

  it('carries exactly the columns the RPC inserts', () => {
    expect(Object.keys(buildPaymentLinkOrder(input)).sort()).toEqual([...RPC_ORDER_COLUMNS].sort());
  });

  it('keeps the values the direct insert used', () => {
    expect(buildPaymentLinkOrder(input)).toEqual({
      customer_id: null,
      stripe_payment_intent_id: 'pi_1',
      stripe_checkout_session_id: 'cs_1',
      amount_cents: 9630,
      currency: 'usd',
      status: 'succeeded',
      order_type: 'entry',
      entry_subtotal_cents: 6000,
      platform_fee_cents: 420,
      platform_fee_rate: 7,
      stripe_processing_fee_cents: 309,
      refunded_cents: 0,
      make_whole_refunded_cents: 0,
      metadata: { entry_payment_link_id: 'link-1', entry_count: 2 },
      show_id: 'show-1',
      entry_ids: ['e-1', 'e-2'],
      paid_at: '2026-10-03T00:00:00.000Z',
    });
  });

  it('a pending processing fee stays NULL; a missing total is 0; currency defaults to usd', () => {
    const order = buildPaymentLinkOrder({
      ...input,
      stripeProcessingFeeCents: null,
      amountTotalCents: null,
      currency: null,
    });
    expect(order.stripe_processing_fee_cents).toBeNull();
    expect(order.amount_cents).toBe(0);
    expect(order.currency).toBe('usd');
  });
});

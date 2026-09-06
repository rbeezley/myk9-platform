import type { EntryReceiptOrder } from '@/features/payments/entryReceiptOrder';

import { buildScopedPaymentFacts } from './scopedPaymentFacts';

function order(overrides: Partial<EntryReceiptOrder> = {}): EntryReceiptOrder {
  return {
    id: 'ff08fa39-41c6-4ef7-bd8a-0195469b1bb8',
    // Midday UTC: `formatPaymentDate` renders in LOCAL time (same as the My
    // Payments row), so a midnight fixture reports the previous day west of
    // Greenwich and the test fails on the runner's zone rather than the code.
    createdAt: '2026-09-06T12:00:00Z',
    paidOn: '2026-09-06T12:00:00Z',
    amountCents: 3210,
    currency: 'usd',
    reference: 'pi_3RwalkDog',
    status: 'succeeded',
    entryIds: ['entry-a'],
    entrySubtotalCents: 3000,
    platformFeeCents: 210,
    refundedCents: 0,
    makeWholeRefundedCents: 0,
    refundedAt: null,
    ...overrides,
  };
}

function valueFor(facts: ReturnType<typeof buildScopedPaymentFacts>, label: string) {
  return facts.rows.find(row => row.label === label)?.value;
}

describe('buildScopedPaymentFacts', () => {
  it('states the amount, date and reference of a settled order', () => {
    const facts = buildScopedPaymentFacts(order());

    // The exact figure from the walk that filed MYK9-420: stripe_orders
    // amount_cents = 3210 must reach the destination as $32.10, byte for byte
    // what the My Payments row that linked here shows.
    expect(facts.headlineLabel).toBe('Amount paid');
    expect(facts.headlineValue).toBe('$32.10');
    expect(facts.statusLabel).toBe('Paid');
    expect(valueFor(facts, 'Paid on')).toBe('Sep 6, 2026');
    expect(valueFor(facts, 'Reference')).toBe('pi_3RwalkDog');
    expect(facts.entriesCovered).toBe(1);
  });

  it('omits refund lines entirely when nothing came back', () => {
    const facts = buildScopedPaymentFacts(order());
    expect(facts.rows.map(row => row.label)).toEqual(['Paid on', 'Reference']);
  });

  it('states gross and refund alongside the net on a partial refund', () => {
    const facts = buildScopedPaymentFacts(
      order({ refundedCents: 1000, refundedAt: '2026-09-08T12:00:00Z' })
    );

    // A partially refunded order keeps status = 'succeeded' (orderSnapshot.ts),
    // so reading the column would print "Paid" over money that was returned.
    expect(facts.statusLabel).toBe('Partially refunded');
    expect(facts.headlineLabel).toBe('Net paid');
    expect(facts.headlineValue).toBe('$22.10');
    expect(valueFor(facts, 'Amount charged')).toBe('$32.10');
    expect(valueFor(facts, 'Refunded')).toBe('-$10.00');
    expect(valueFor(facts, 'Refunded on')).toBe('Sep 8, 2026');
  });

  it('never states a bare zero for a fully refunded order', () => {
    const facts = buildScopedPaymentFacts(order({ refundedCents: 3210 }));

    // $0.00 net is true in two different worlds — nothing happened, and
    // everything was reversed. The gross and refund lines are what tell them
    // apart, so a fully refunded order must still print both.
    expect(facts.statusLabel).toBe('Refunded');
    expect(facts.headlineValue).toBe('$0.00');
    expect(valueFor(facts, 'Amount charged')).toBe('$32.10');
    expect(valueFor(facts, 'Refunded')).toBe('-$32.10');
  });

  it('counts the cart-overflow auto-refund as money returned', () => {
    // amount_cents is deliberately NOT netted by make_whole_refunded_cents, so
    // ignoring that column overstates what the exhibitor kept by exactly the
    // overflow that was handed straight back.
    const facts = buildScopedPaymentFacts(order({ makeWholeRefundedCents: 1210 }));

    expect(facts.headlineValue).toBe('$20.00');
    expect(valueFor(facts, 'Refunded')).toBe('-$12.10');
    expect(facts.statusLabel).toBe('Partially refunded');
  });

  it('adds both refund columns rather than taking either alone', () => {
    const facts = buildScopedPaymentFacts(
      order({ refundedCents: 1000, makeWholeRefundedCents: 210 })
    );
    expect(valueFor(facts, 'Refunded')).toBe('-$12.10');
    expect(facts.headlineValue).toBe('$20.00');
  });

  it('falls back to the order id when the payment intent is missing', () => {
    const facts = buildScopedPaymentFacts(order({ reference: null }));
    expect(valueFor(facts, 'Reference')).toBe('ff08fa39-41c6-4ef7-bd8a-0195469b1bb8');
  });

  it('renders a dash rather than an invented date when no date is known', () => {
    const facts = buildScopedPaymentFacts(order({ createdAt: null, paidOn: null }));
    expect(valueFor(facts, 'Paid on')).toBe('-');
  });

  it('dates the receipt by capture, not by row creation', () => {
    // Capture can lag creation on a delayed or previously pending payment, and
    // the My Payments row that linked here shows `paid_at ?? created_at`. Using
    // createdAt makes the receipt disagree with its own source row.
    const facts = buildScopedPaymentFacts(
      order({ createdAt: '2026-09-06T12:00:00Z', paidOn: '2026-09-09T12:00:00Z' })
    );
    expect(valueFor(facts, 'Paid on')).toBe('Sep 9, 2026');
  });

  it('formats in the order currency, not a hard-coded dollar sign', () => {
    const facts = buildScopedPaymentFacts(order({ currency: 'cad' }));
    expect(facts.headlineValue).toBe('CA$32.10');
  });

  it('reports how many entry rows the order paid for', () => {
    const facts = buildScopedPaymentFacts(order({ entryIds: ['a', 'b', 'c'] }));
    expect(facts.entriesCovered).toBe(3);
  });
});

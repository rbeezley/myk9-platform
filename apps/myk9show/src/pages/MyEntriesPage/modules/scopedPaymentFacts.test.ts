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
    const facts = buildScopedPaymentFacts(order(), 0);

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
    const facts = buildScopedPaymentFacts(order(), 0);
    expect(facts.rows.map(row => row.label)).toEqual(['Paid on', 'Reference']);
  });

  it('states gross and refund alongside the net on a partial refund', () => {
    const facts = buildScopedPaymentFacts(
      order({ refundedCents: 1000, refundedAt: '2026-09-08T12:00:00Z' }),
      0
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
    const facts = buildScopedPaymentFacts(order({ refundedCents: 3210 }), 0);

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
    const facts = buildScopedPaymentFacts(order({ makeWholeRefundedCents: 1210 }), 0);

    expect(facts.headlineValue).toBe('$20.00');
    expect(valueFor(facts, 'Refunded')).toBe('-$12.10');
    expect(facts.statusLabel).toBe('Partially refunded');
  });

  it('adds both refund columns rather than taking either alone', () => {
    const facts = buildScopedPaymentFacts(
      order({ refundedCents: 1000, makeWholeRefundedCents: 210 }),
      0
    );
    expect(valueFor(facts, 'Refunded')).toBe('-$12.10');
    expect(facts.headlineValue).toBe('$20.00');
  });

  it('falls back to the order id when the payment intent is missing', () => {
    const facts = buildScopedPaymentFacts(order({ reference: null }), 0);
    expect(valueFor(facts, 'Reference')).toBe('ff08fa39-41c6-4ef7-bd8a-0195469b1bb8');
  });

  it('renders a dash rather than an invented date when no date is known', () => {
    const facts = buildScopedPaymentFacts(order({ createdAt: null, paidOn: null }), 0);
    expect(valueFor(facts, 'Paid on')).toBe('-');
  });

  it('dates the receipt by capture, not by row creation', () => {
    // Capture can lag creation on a delayed or previously pending payment, and
    // the My Payments row that linked here shows `paid_at ?? created_at`. Using
    // createdAt makes the receipt disagree with its own source row.
    const facts = buildScopedPaymentFacts(
      order({ createdAt: '2026-09-06T12:00:00Z', paidOn: '2026-09-09T12:00:00Z' }),
      0
    );
    expect(valueFor(facts, 'Paid on')).toBe('Sep 9, 2026');
  });

  it('formats in the order currency, not a hard-coded dollar sign', () => {
    const facts = buildScopedPaymentFacts(order({ currency: 'cad' }), 0);
    expect(facts.headlineValue).toBe('CA$32.10');
  });

  describe('refunds recorded by only one of the two writers', () => {
    // `stripe-refund-entry` writes entries.refund_amount synchronously; the
    // order's refunded_cents is only written later by the webhook. A receipt
    // read inside that window must not print a gross with no refund while the
    // My Payments row that linked to it already shows one.
    it('honours an entry refund the order columns have not caught up with', () => {
      const facts = buildScopedPaymentFacts(order({ refundedCents: 0 }), 1000);

      expect(facts.statusLabel).toBe('Partially refunded');
      expect(facts.headlineLabel).toBe('Net paid');
      expect(facts.headlineValue).toBe('$22.10');
      expect(valueFor(facts, 'Refunded')).toBe('-$10.00');
    });

    // The reverse lag: a Stripe DASHBOARD refund sets refunded_cents and never
    // touches the entries. The webhook alerts an admin to reconcile it by hand,
    // and until they do the entry sum reads zero.
    it('honours an order refund the entries have not caught up with', () => {
      const facts = buildScopedPaymentFacts(order({ refundedCents: 1000 }), 0);
      expect(valueFor(facts, 'Refunded')).toBe('-$10.00');
    });

    it('never double-counts the same refund recorded in both places', () => {
      const facts = buildScopedPaymentFacts(order({ refundedCents: 1000 }), 1000);
      expect(valueFor(facts, 'Refunded')).toBe('-$10.00');
      expect(facts.headlineValue).toBe('$22.10');
    });

    it('takes the larger when the two disagree, never the smaller', () => {
      // Understating a refund tells an exhibitor they paid more than they kept.
      expect(valueFor(buildScopedPaymentFacts(order({ refundedCents: 500 }), 1500), 'Refunded')).toBe(
        '-$15.00'
      );
      expect(valueFor(buildScopedPaymentFacts(order({ refundedCents: 1500 }), 500), 'Refunded')).toBe(
        '-$15.00'
      );
    });

    it('treats a legacy refunded order with no refund columns as fully refunded', () => {
      // Predates the snapshot columns: status says refunded, no figure anywhere.
      // Without the fallback the panel printed the full gross as "Amount paid"
      // beside the word "Refunded".
      const facts = buildScopedPaymentFacts(
        order({ status: 'refunded', refundedCents: 0, makeWholeRefundedCents: 0 }),
        0
      );

      expect(facts.statusLabel).toBe('Refunded');
      expect(facts.headlineLabel).toBe('Net paid');
      expect(facts.headlineValue).toBe('$0.00');
      expect(valueFor(facts, 'Amount charged')).toBe('$32.10');
      expect(valueFor(facts, 'Refunded')).toBe('-$32.10');
    });

    it('does not double-count a cart-overflow order that is also status refunded', () => {
      // The four such orders on staging. The whole gross already sits in
      // make_whole_refunded_cents; adding the legacy fallback on top would
      // report twice the money back and a negative net.
      const facts = buildScopedPaymentFacts(
        order({ status: 'refunded', refundedCents: 0, makeWholeRefundedCents: 3210 }),
        0
      );

      expect(valueFor(facts, 'Refunded')).toBe('-$32.10');
      expect(facts.headlineValue).toBe('$0.00');
    });

    it('leaves a settled order alone — the fallback is keyed on refunded status', () => {
      const facts = buildScopedPaymentFacts(order({ status: 'succeeded' }), 0);
      expect(facts.headlineLabel).toBe('Amount paid');
      expect(facts.headlineValue).toBe('$32.10');
      expect(facts.rows.map(row => row.label)).toEqual(['Paid on', 'Reference']);
    });

    it('still adds the cart-overflow refund on top of the resolved post-hoc one', () => {
      // Separate money: the overflow was never part of the accepted lines.
      const facts = buildScopedPaymentFacts(
        order({ refundedCents: 0, makeWholeRefundedCents: 210 }),
        1000
      );
      expect(valueFor(facts, 'Refunded')).toBe('-$12.10');
      expect(facts.headlineValue).toBe('$20.00');
    });
  });

  it('reports how many entry rows the order paid for', () => {
    const facts = buildScopedPaymentFacts(order({ entryIds: ['a', 'b', 'c'] }), 0);
    expect(facts.entriesCovered).toBe(3);
  });
});

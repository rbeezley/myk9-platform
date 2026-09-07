import {
  orderRefundStatusLabel,
  resolveOrderNetPaidCents,
  resolveOrderRefundedCents,
  type OrderRefundSources,
} from './orderRefundReconciliation';

function sources(overrides: Partial<OrderRefundSources> = {}): OrderRefundSources {
  return {
    amountCents: 3210,
    status: 'succeeded',
    refundedCents: 0,
    makeWholeRefundedCents: 0,
    entryRefundedCents: 0,
    ...overrides,
  };
}

describe('resolveOrderRefundedCents', () => {
  it('reports nothing back on a settled order', () => {
    expect(resolveOrderRefundedCents(sources())).toBe(0);
    expect(resolveOrderNetPaidCents(sources())).toBe(3210);
    expect(orderRefundStatusLabel(sources())).toBe('Paid');
  });

  describe('the two writers lag in both directions', () => {
    it('sees an app refund the order columns have not caught up with', () => {
      // `stripe-refund-entry` writes entries.refund_amount synchronously and
      // never touches stripe_orders; refunded_cents waits for the webhook.
      expect(resolveOrderRefundedCents(sources({ entryRefundedCents: 1000 }))).toBe(1000);
      expect(resolveOrderNetPaidCents(sources({ entryRefundedCents: 1000 }))).toBe(2210);
      expect(orderRefundStatusLabel(sources({ entryRefundedCents: 1000 }))).toBe(
        'Partially refunded'
      );
    });

    it('sees a dashboard refund the entries have not caught up with', () => {
      // A Stripe dashboard refund sets refunded_cents and never touches the
      // entries; the webhook alerts an admin to reconcile it by hand.
      expect(resolveOrderRefundedCents(sources({ refundedCents: 1000 }))).toBe(1000);
      expect(orderRefundStatusLabel(sources({ refundedCents: 1000 }))).toBe('Partially refunded');
    });

    it('takes the larger when the two disagree, never the smaller', () => {
      // Understating tells an exhibitor they paid more than they kept. Being
      // early costs nothing: the two converge when the lagging writer lands.
      expect(
        resolveOrderRefundedCents(sources({ refundedCents: 500, entryRefundedCents: 1500 }))
      ).toBe(1500);
      expect(
        resolveOrderRefundedCents(sources({ refundedCents: 1500, entryRefundedCents: 500 }))
      ).toBe(1500);
    });

    it('never double-counts the same refund recorded in both places', () => {
      expect(
        resolveOrderRefundedCents(sources({ refundedCents: 1000, entryRefundedCents: 1000 }))
      ).toBe(1000);
    });
  });

  it('adds the cart-overflow auto-refund on top as separate money', () => {
    // amount_cents is deliberately NOT netted by make_whole_refunded_cents, so
    // the overflow always adds rather than replacing the post-hoc figure.
    expect(
      resolveOrderRefundedCents(sources({ entryRefundedCents: 1000, makeWholeRefundedCents: 210 }))
    ).toBe(1210);
  });

  describe('the legacy refunded-status fallback', () => {
    it('treats a refunded order with no figure anywhere as fully refunded', () => {
      const legacy = sources({ status: 'refunded' });
      expect(resolveOrderRefundedCents(legacy)).toBe(3210);
      expect(resolveOrderNetPaidCents(legacy)).toBe(0);
      expect(orderRefundStatusLabel(legacy)).toBe('Refunded');
    });

    it('does not fire once either writer has recorded a figure', () => {
      // Otherwise a PARTIALLY refunded legacy row would report its whole gross.
      expect(resolveOrderRefundedCents(sources({ status: 'refunded', refundedCents: 1000 }))).toBe(
        1000
      );
    });

    it('leaves a non-refunded status alone', () => {
      expect(resolveOrderRefundedCents(sources({ status: 'pending' }))).toBe(0);
      expect(orderRefundStatusLabel(sources({ status: 'pending' }))).toBe('Pending');
    });
  });

  describe('the four cart-overflow orders on staging (MYK9-428 AC4)', () => {
    // Replayed verbatim from stripe_orders on 2026-09-06: status 'refunded',
    // zero entries, the whole gross in make_whole_refunded_cents and nothing in
    // refunded_cents. The legacy fallback nets the overflow out, so each still
    // resolves to exactly its gross — never twice it, and never a negative net.
    it.each([
      ['c42caa66-24b0-4b0f-bea0-f50552d731af', 6420],
      ['c72add22-01c4-427b-9865-ca707b267aee', 3745],
      ['cedb3da0-337b-4c26-90ec-be50a7c818a5', 3745],
      ['5578b168-30c8-409a-8667-759f00732ff2', 3745],
    ])('resolves %s to its gross exactly once', (_id, amountCents) => {
      const overflow = sources({
        amountCents,
        status: 'refunded',
        refundedCents: 0,
        makeWholeRefundedCents: amountCents,
        entryRefundedCents: 0,
      });

      expect(resolveOrderRefundedCents(overflow)).toBe(amountCents);
      expect(resolveOrderNetPaidCents(overflow)).toBe(0);
      expect(orderRefundStatusLabel(overflow)).toBe('Refunded');
    });
  });

  it('decides refunded-ness on the refund total, never on the net', () => {
    // A zero net is true in two different worlds — nothing happened, and
    // everything was reversed — so it can never be the discriminator. A
    // zero-gross order nets to zero with nothing returned and must not read as
    // refunded; a fully returned order nets to zero and must.
    expect(resolveOrderNetPaidCents(sources({ amountCents: 0 }))).toBe(0);
    expect(orderRefundStatusLabel(sources({ amountCents: 0 }))).toBe('Paid');
    expect(resolveOrderNetPaidCents(sources({ entryRefundedCents: 3210 }))).toBe(0);
    expect(orderRefundStatusLabel(sources({ entryRefundedCents: 3210 }))).toBe('Refunded');
  });
});

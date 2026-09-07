import { describe, expect, it } from 'vitest';
import {
  buildPaymentDisplayRows,
  formatPaymentCents,
  isRetryablePaymentStatus,
  isSettlingPaymentStatus,
  paymentStatusLabel,
  type PaymentPresentationSource,
} from './moneyPresentation';

function payment(overrides: Partial<PaymentPresentationSource> = {}): PaymentPresentationSource {
  return {
    id: 'order-1',
    date: '2026-06-10T00:00:00Z',
    showId: 'show-1',
    showName: 'Spring Trial',
    amountCents: 5300,
    currency: 'usd',
    status: 'succeeded',
    reference: 'pi_abc123',
    entryIds: ['entry-1'],
    ...overrides,
  };
}

describe('moneyPresentation', () => {
  it('formats cents as currency, including signed refund rows', () => {
    expect(formatPaymentCents(5300, 'usd')).toBe('$53.00');
    expect(formatPaymentCents(-3000, 'usd')).toBe('-$30.00');
  });

  it('labels known payment statuses without leaking raw tokens', () => {
    expect(paymentStatusLabel('succeeded')).toBe('Paid');
    expect(paymentStatusLabel('canceled')).toBe('Cancelled');
    expect(paymentStatusLabel('processing')).toBe('Processing');
  });

  it('builds separate charge and refund rows so refunds are visible, not silently netted', () => {
    const rows = buildPaymentDisplayRows([
      payment({
        refunds: [
          {
            entryId: 'entry-1',
            amountCents: 3000,
            date: '2026-06-12T00:00:00Z',
            label: 'Copper - Advanced A',
          },
        ],
      }),
    ]);

    // Refund first: it is dated 06-12 against a 06-10 charge, and the ledger
    // is newest-first. Ordering itself is pinned by the sort tests below.
    expect(rows).toMatchObject([
      {
        id: 'order-1:refund:entry-1',
        kind: 'refund',
        description: 'Refund - Copper - Advanced A',
        amountCents: -3000,
        status: 'refunded',
      },
      { id: 'order-1:charge', kind: 'charge', description: 'Online entry fees', amountCents: 5300 },
    ]);
    expect(rows.reduce((sum, row) => sum + row.amountCents, 0)).toBe(2300);
  });

  it('keeps gross paid visible for refunded orders that have explicit entry refund rows', () => {
    const rows = buildPaymentDisplayRows([
      payment({
        status: 'refunded',
        refunds: [
          {
            entryId: 'entry-1',
            amountCents: 5300,
            date: '2026-06-12T00:00:00Z',
            label: 'Copper - Advanced A',
          },
        ],
      }),
    ]);

    expect(rows).toMatchObject([
      {
        id: 'order-1:refund:entry-1',
        kind: 'refund',
        amountCents: -5300,
        status: 'refunded',
      },
      { id: 'order-1:charge', kind: 'charge', amountCents: 5300, status: 'succeeded' },
    ]);
    expect(rows.reduce((sum, row) => sum + row.amountCents, 0)).toBe(0);
  });

  it('keeps legacy fully-refunded order rows as gross charge plus signed refund when no entry refund detail exists', () => {
    const rows = buildPaymentDisplayRows([payment({ status: 'refunded', refunds: [] })]);

    expect(rows).toMatchObject([
      {
        id: 'order-1:charge',
        kind: 'charge',
        description: 'Online entry fees',
        amountCents: 5300,
        status: 'succeeded',
      },
      { id: 'order-1:refund', kind: 'refund', description: 'Refund', amountCents: -5300 },
    ]);
    expect(rows.reduce((sum, row) => sum + row.amountCents, 0)).toBe(0);
  });

  it('dates a legacy full refund by refunded_at, not by the charge it reverses', () => {
    // The synthetic refund used to inherit `payment.date`, which was invisible
    // until the ledger could be scoped by year: a 2025 charge refunded in 2026
    // then subtotaled under 2025, contradicting cash basis.
    const rows = buildPaymentDisplayRows([
      payment({
        status: 'refunded',
        refunds: [],
        date: '2025-12-20T12:00:00Z',
        refundedAt: '2026-01-08T12:00:00Z',
      }),
    ]);

    // Keyed by id, not position: this is about the DATE each row carries.
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    expect(byId['order-1:charge'].date).toBe('2025-12-20T12:00:00Z');
    expect(byId['order-1:refund'].date).toBe('2026-01-08T12:00:00Z');
  });

  it('orders the ledger by the date on each row, not by the order it belongs to', () => {
    // useMyPayments returns orders created_at DESC and each expands to a
    // charge plus its refunds, so a late refund used to sink to its charge's
    // position: a 2026 refund of a 2024 charge sat below every 2026 charge.
    const rows = buildPaymentDisplayRows([
      payment({
        id: 'old-order',
        status: 'refunded',
        refunds: [],
        date: '2024-05-01T12:00:00Z',
        refundedAt: '2026-06-15T12:00:00Z',
      }),
      payment({ id: 'new-order', date: '2026-02-01T12:00:00Z' }),
    ]);

    expect(rows.map(r => r.id)).toEqual([
      'old-order:refund', // 2026-06-15
      'new-order:charge', // 2026-02-01
      'old-order:charge', // 2024-05-01
    ]);
  });

  it('keeps a charge above the refund that reverses it at the same instant', () => {
    // The sort must be stable, or a same-instant pair could flip and the
    // ledger would show money coming back before it went out.
    const rows = buildPaymentDisplayRows([payment({ status: 'refunded', refunds: [] })]);
    expect(rows.map(r => r.kind)).toEqual(['charge', 'refund']);
  });

  it('puts undated rows last rather than at the top', () => {
    const rows = buildPaymentDisplayRows([
      payment({ id: 'undated', date: null }),
      payment({ id: 'dated', date: '2026-02-01T12:00:00Z' }),
    ]);
    expect(rows.map(r => r.id)).toEqual(['dated:charge', 'undated:charge']);
  });

  describe('refunds only the ORDER columns know about (MYK9-428)', () => {
    // The ledger's refund rows come from entries.refund_amount. A Stripe
    // DASHBOARD refund never touches the entries, so before this the ledger
    // silently understated money the receipt for the same order showed in full.
    it('emits a reconciliation row for a dashboard refund the entries never saw', () => {
      const rows = buildPaymentDisplayRows([
        payment({ refundedCents: 2000, refundedAt: '2026-06-14T00:00:00Z', refunds: [] }),
      ]);

      expect(rows.map(row => row.id)).toEqual(['order-1:refund:unreconciled', 'order-1:charge']);
      expect(rows[0]).toMatchObject({
        kind: 'refund',
        amountCents: -2000,
        // Its OWN date: a cash-basis year must file the refund under the year
        // it happened, not the year the charge was made.
        date: '2026-06-14T00:00:00Z',
        status: 'refunded',
      });
    });

    it('states only the REMAINDER when the entries already carry part of it', () => {
      const rows = buildPaymentDisplayRows([
        payment({
          refundedCents: 3000,
          refunds: [
            {
              entryId: 'entry-1',
              amountCents: 2000,
              date: '2026-06-12T00:00:00Z',
              label: 'Copper',
            },
          ],
        }),
      ]);

      const refunded = rows
        .filter(row => row.kind === 'refund')
        .reduce((sum, row) => sum + Math.abs(row.amountCents), 0);
      // 3000, not 5000: the entry row and the order column describe the same
      // money, so the reconciliation row states only what is not already said.
      expect(refunded).toBe(3000);
    });

    it('adds nothing when the entries already state the whole refund', () => {
      // The app-refund window: entries ahead, refunded_cents not yet written.
      const rows = buildPaymentDisplayRows([
        payment({
          refundedCents: 0,
          refunds: [
            {
              entryId: 'entry-1',
              amountCents: 2000,
              date: '2026-06-12T00:00:00Z',
              label: 'Copper',
            },
          ],
        }),
      ]);

      expect(rows.filter(row => row.id.endsWith(':unreconciled'))).toHaveLength(0);
    });

    it('counts the cart-overflow auto-refund, which no entry row records', () => {
      const rows = buildPaymentDisplayRows([payment({ makeWholeRefundedCents: 300, refunds: [] })]);
      expect(rows.find(row => row.id.endsWith(':unreconciled'))).toMatchObject({
        amountCents: -300,
      });
    });

    it.each([
      ['c42caa66-24b0-4b0f-bea0-f50552d731af', 6420],
      ['c72add22-01c4-427b-9865-ca707b267aee', 3745],
      ['cedb3da0-337b-4c26-90ec-be50a7c818a5', 3745],
      ['5578b168-30c8-409a-8667-759f00732ff2', 3745],
    ])('leaves staging cart-overflow order %s stated exactly once (AC4)', (id, amountCents) => {
      // status 'refunded', zero entries, the whole gross in
      // make_whole_refunded_cents. The legacy branch already states the full
      // refund, so the remainder must be zero — a second row here would report
      // twice the money back and a negative net for the year.
      const rows = buildPaymentDisplayRows([
        payment({
          id,
          amountCents,
          status: 'refunded',
          refundedCents: 0,
          makeWholeRefundedCents: amountCents,
          entryIds: [],
          refunds: [],
        }),
      ]);

      // Charge then refund: same date, and the sort is stable. What matters is
      // that there are exactly TWO rows — a third, ':refund:unreconciled',
      // would be the gross stated a second time.
      expect(rows.map(row => row.id)).toEqual([id + ':charge', id + ':refund']);
      const refunded = rows
        .filter(row => row.kind === 'refund')
        .reduce((sum, row) => sum + Math.abs(row.amountCents), 0);
      expect(refunded).toBe(amountCents);
    });
  });

  it('falls back to the charge date when a legacy refund has no refunded_at', () => {
    const rows = buildPaymentDisplayRows([
      payment({ status: 'refunded', refunds: [], date: '2025-12-20T12:00:00Z', refundedAt: null }),
    ]);

    expect(rows[1]).toMatchObject({ kind: 'refund', date: '2025-12-20T12:00:00Z' });
  });
});

describe('isSettlingPaymentStatus', () => {
  // The two in-flight values stripe_orders.status is allowed to hold; the
  // column's CHECK constraint (migration 005) forbids Stripe's raw intent
  // statuses, so there is nothing else to cover here.
  it.each(['pending', 'processing'])('treats %s as money still in flight', status => {
    expect(isSettlingPaymentStatus(status)).toBe(true);
  });

  it('is case-insensitive, matching the other status predicates', () => {
    expect(isSettlingPaymentStatus('PENDING')).toBe(true);
  });

  it.each(['succeeded', 'paid', 'refunded', 'failed', 'cancelled', 'canceled', ''])(
    'does not treat settled or failed status %s as in flight',
    status => {
      expect(isSettlingPaymentStatus(status)).toBe(false);
    }
  );

  it('never overlaps with the retryable set', () => {
    // The two drive mutually exclusive affordances: offering a retry link on
    // an in-flight order invites a duplicate charge.
    const statuses = [
      'pending',
      'processing',
      'failed',
      'cancelled',
      'canceled',
      'succeeded',
      'refunded',
    ];
    for (const status of statuses) {
      expect(isSettlingPaymentStatus(status) && isRetryablePaymentStatus(status)).toBe(false);
    }
  });
});

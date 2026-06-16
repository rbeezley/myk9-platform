import { describe, it, expect } from 'vitest';
import {
  calculateShowPayoutCents,
  sumOnlineCollectedCents,
  sumRefundedCents,
  computeSettleDate,
  buildLedgerRows,
  summarizeLedger,
  pickCanonicalPayout,
  type LedgerEntryRow,
  type LedgerShow,
  type LedgerPayout,
} from './payoutLedger';

function payout(p: Partial<LedgerPayout>): LedgerPayout {
  return {
    show_id: 's1',
    amount_cents: 1000,
    status: 'pending',
    stripe_transfer_id: null,
    completed_at: null,
    created_at: '2026-06-01T00:00:00Z',
    ...p,
  };
}

function entry(p: Partial<LedgerEntryRow>): LedgerEntryRow {
  return {
    show_id: 's1',
    entry_fee: 25,
    payment_method: 'online',
    payment_status: 'paid',
    refund_amount: null,
    ...p,
  };
}

describe('calculateShowPayoutCents (parity with _shared/payoutCalc.ts)', () => {
  it('sums online paid entries in cents', () => {
    expect(calculateShowPayoutCents([entry({ entry_fee: 25 }), entry({ entry_fee: 30 })])).toBe(
      5500
    );
  });

  it('excludes desk payments (cash/check/waived)', () => {
    expect(
      calculateShowPayoutCents([entry({ entry_fee: 25, payment_method: 'cash' })])
    ).toBe(0);
  });

  it('deducts per-entry refunds and floors at zero', () => {
    // 25.00 - 10.00 refund = 1500; a refund exceeding the fee floors at 0.
    expect(
      calculateShowPayoutCents([
        entry({ entry_fee: 25, payment_status: 'refunded', refund_amount: 10 }),
        entry({ entry_fee: 25, payment_status: 'refunded', refund_amount: 40 }),
      ])
    ).toBe(1500);
  });

  it('rounds per entry (DECIMAL dollars → cents) without float drift', () => {
    expect(calculateShowPayoutCents([entry({ entry_fee: 0.1 }), entry({ entry_fee: 0.2 })])).toBe(
      30
    );
  });
});

describe('sumOnlineCollectedCents / sumRefundedCents', () => {
  it('collected is gross: includes paid AND refunded online entries, excludes desk', () => {
    // A refunded entry was still charged before the refund; refunds are shown
    // separately, so Collected − Refunds == Net owed.
    expect(
      sumOnlineCollectedCents([
        entry({ entry_fee: 25 }),
        entry({ entry_fee: 25, payment_status: 'refunded', refund_amount: 25 }),
        entry({ entry_fee: 25, payment_method: 'cash' }),
      ])
    ).toBe(5000);
  });

  it('refunded sums refund_amount across online entries', () => {
    expect(
      sumRefundedCents([
        entry({ refund_amount: 10 }),
        entry({ refund_amount: 5.5 }),
        entry({ payment_method: 'cash', refund_amount: 99 }),
      ])
    ).toBe(1550);
  });
});

describe('computeSettleDate', () => {
  it('adds 3 days to end_date', () => {
    expect(computeSettleDate('2026-06-10')).toBe('2026-06-13');
  });
  it('returns null for missing/invalid dates', () => {
    expect(computeSettleDate(null)).toBeNull();
    expect(computeSettleDate('not-a-date')).toBeNull();
  });
});

describe('buildLedgerRows', () => {
  const shows: LedgerShow[] = [
    { id: 's1', name: 'Spring Trial', club_id: 'c1', clubName: 'Club One', endDate: '2026-06-01' },
    { id: 's2', name: 'Summer Trial', club_id: 'c2', clubName: 'Club Two', endDate: '2026-06-20' },
  ];

  it('prefers the live payout amount over the computed value', () => {
    const entriesByShow = new Map<string, LedgerEntryRow[]>([
      ['s1', [entry({ show_id: 's1', entry_fee: 25 })]],
    ]);
    const payoutsByShow = new Map<string, LedgerPayout[]>([
      [
        's1',
        [payout({ show_id: 's1', amount_cents: 9999, status: 'completed', stripe_transfer_id: 'tr_1' })],
      ],
    ]);
    const rows = buildLedgerRows(shows, entriesByShow, payoutsByShow);
    const s1 = rows.find(r => r.showId === 's1')!;
    expect(s1.netOwedCents).toBe(9999); // live payout, not the computed 2500
    expect(s1.payoutStatus).toBe('completed');
    expect(s1.stripeTransferId).toBe('tr_1');
    expect(s1.settleDate).toBe('2026-06-04');
  });

  it('falls back to the computed liability for shows with no payout row', () => {
    const entriesByShow = new Map<string, LedgerEntryRow[]>([
      ['s2', [entry({ show_id: 's2', entry_fee: 30 }), entry({ show_id: 's2', entry_fee: 30 })]],
    ]);
    const rows = buildLedgerRows(shows, entriesByShow, new Map());
    const s2 = rows.find(r => r.showId === 's2')!;
    expect(s2.netOwedCents).toBe(6000);
    expect(s2.payoutStatus).toBeNull();
  });

  it('ignores stale failed rows when a live row exists for the show', () => {
    const payoutsByShow = new Map<string, LedgerPayout[]>([
      [
        's1',
        [
          payout({ show_id: 's1', status: 'failed', amount_cents: 111, created_at: '2026-06-03T00:00:00Z' }),
          payout({ show_id: 's1', status: 'completed', amount_cents: 5000, stripe_transfer_id: 'tr_ok', created_at: '2026-06-02T00:00:00Z' }),
        ],
      ],
    ]);
    const rows = buildLedgerRows(shows, new Map(), payoutsByShow);
    const s1 = rows.find(r => r.showId === 's1')!;
    expect(s1.payoutStatus).toBe('completed'); // not the newer failed row
    expect(s1.netOwedCents).toBe(5000);
    expect(s1.stripeTransferId).toBe('tr_ok');
  });

  it('sorts by settle date descending (newest first)', () => {
    const rows = buildLedgerRows(shows, new Map(), new Map());
    expect(rows.map(r => r.showId)).toEqual(['s2', 's1']);
  });
});

describe('summarizeLedger', () => {
  it('splits completed payouts from outstanding liability', () => {
    const shows: LedgerShow[] = [
      { id: 's1', name: 'A', club_id: 'c1', clubName: 'C1', endDate: '2026-06-01' },
      { id: 's2', name: 'B', club_id: 'c2', clubName: 'C2', endDate: '2026-06-02' },
    ];
    const payoutsByShow = new Map<string, LedgerPayout[]>([
      ['s1', [payout({ show_id: 's1', amount_cents: 5000, status: 'completed', stripe_transfer_id: 't' })]],
      ['s2', [payout({ show_id: 's2', amount_cents: 3000, status: 'pending' })]],
    ]);
    const rows = buildLedgerRows(shows, new Map(), payoutsByShow);
    expect(summarizeLedger(rows)).toEqual({ outstandingCents: 3000, paidOutCents: 5000 });
  });
});

describe('pickCanonicalPayout', () => {
  it('returns undefined for no rows', () => {
    expect(pickCanonicalPayout([])).toBeUndefined();
  });

  it('prefers the non-failed row over failed retries', () => {
    const chosen = pickCanonicalPayout([
      payout({ status: 'failed', amount_cents: 1, created_at: '2026-06-05T00:00:00Z' }),
      payout({ status: 'pending', amount_cents: 2, created_at: '2026-06-01T00:00:00Z' }),
    ]);
    expect(chosen?.status).toBe('pending');
  });

  it('ranks completed over processing over pending', () => {
    expect(
      pickCanonicalPayout([
        payout({ status: 'pending' }),
        payout({ status: 'completed' }),
        payout({ status: 'processing' }),
      ])?.status
    ).toBe('completed');
  });

  it('falls back to the most recent failed row when all failed', () => {
    const chosen = pickCanonicalPayout([
      payout({ status: 'failed', amount_cents: 1, created_at: '2026-06-01T00:00:00Z' }),
      payout({ status: 'failed', amount_cents: 2, created_at: '2026-06-09T00:00:00Z' }),
    ]);
    expect(chosen?.amount_cents).toBe(2);
  });
});

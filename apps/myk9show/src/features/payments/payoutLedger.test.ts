import { describe, it, expect } from 'vitest';
import {
  calculateShowPayoutCents,
  sumOnlineCollectedCents,
  sumRefundedCents,
  computeSettleDate,
  buildLedgerRows,
  summarizeLedger,
  type LedgerEntryRow,
  type LedgerShow,
  type LedgerPayout,
} from './payoutLedger';

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
  it('collected counts only online paid (gross, pre-refund)', () => {
    expect(
      sumOnlineCollectedCents([
        entry({ entry_fee: 25 }),
        entry({ entry_fee: 25, payment_status: 'refunded', refund_amount: 25 }),
        entry({ entry_fee: 25, payment_method: 'cash' }),
      ])
    ).toBe(2500);
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
    const payoutByShow = new Map<string, LedgerPayout>([
      [
        's1',
        {
          show_id: 's1',
          amount_cents: 9999,
          status: 'completed',
          stripe_transfer_id: 'tr_1',
          completed_at: '2026-06-05',
        },
      ],
    ]);
    const rows = buildLedgerRows(shows, entriesByShow, payoutByShow);
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
    const payoutByShow = new Map<string, LedgerPayout>([
      [
        's1',
        { show_id: 's1', amount_cents: 5000, status: 'completed', stripe_transfer_id: 't', completed_at: 'x' },
      ],
      [
        's2',
        { show_id: 's2', amount_cents: 3000, status: 'pending', stripe_transfer_id: null, completed_at: null },
      ],
    ]);
    const rows = buildLedgerRows(shows, new Map(), payoutByShow);
    expect(summarizeLedger(rows)).toEqual({ outstandingCents: 3000, paidOutCents: 5000 });
  });
});

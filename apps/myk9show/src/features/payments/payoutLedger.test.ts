import { describe, it, expect } from 'vitest';
import {
  calculateShowPayoutCents,
  sumOnlineCollectedCents,
  sumRefundedCents,
  sumUncollectedRefundCents,
  countUncollectedRefunds,
  computeSettleDate,
  buildLedgerRows,
  summarizeLedger,
  pickCanonicalPayout,
  resolveUnsettledState,
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
    id: 'e1',
    show_id: 's1',
    entry_status: 'confirmed',
    entry_fee: 25,
    payment_method: 'online',
    payment_status: 'paid',
    refund_amount: null,
    refund_decision: null,
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
    expect(calculateShowPayoutCents([entry({ entry_fee: 25, payment_method: 'cash' })])).toBe(0);
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

  it('separately counts refunds recorded before an online entry was paid', () => {
    const entries = [
      entry({ payment_status: 'pending', refund_amount: 25 }),
      entry({ payment_status: null, refund_amount: 5.5 }),
      entry({ payment_status: 'failed', refund_amount: 4 }),
      entry({ payment_status: 'paid', refund_amount: 3 }),
      entry({ payment_method: 'cash', payment_status: 'pending', refund_amount: 9 }),
    ];

    expect(countUncollectedRefunds(entries)).toBe(3);
    expect(sumUncollectedRefundCents(entries)).toBe(3450);
    expect(sumOnlineCollectedCents(entries) - sumRefundedCents(entries)).toBe(
      calculateShowPayoutCents(entries)
    );
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
        [
          payout({
            show_id: 's1',
            amount_cents: 9999,
            status: 'completed',
            stripe_transfer_id: 'tr_1',
          }),
        ],
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

  it('uses the computed net (not the stale failed amount) when only failed rows exist', () => {
    // A payout failed at 5000, then the show was partly refunded → real
    // liability is now 2000. The ledger must show the recomputed 2000 (what a
    // retry would transfer), while still surfacing the failed status.
    const entriesByShow = new Map<string, LedgerEntryRow[]>([
      [
        's1',
        [entry({ show_id: 's1', entry_fee: 50, payment_status: 'refunded', refund_amount: 30 })],
      ],
    ]);
    const payoutsByShow = new Map<string, LedgerPayout[]>([
      ['s1', [payout({ show_id: 's1', status: 'failed', amount_cents: 5000 })]],
    ]);
    const rows = buildLedgerRows(shows, entriesByShow, payoutsByShow);
    const s1 = rows.find(r => r.showId === 's1')!;
    expect(s1.netOwedCents).toBe(2000); // computed (50 - 30), not the stale 5000
    expect(s1.payoutStatus).toBe('failed');
  });

  it('ignores stale failed rows when a live row exists for the show', () => {
    const payoutsByShow = new Map<string, LedgerPayout[]>([
      [
        's1',
        [
          payout({
            show_id: 's1',
            status: 'failed',
            amount_cents: 111,
            created_at: '2026-06-03T00:00:00Z',
          }),
          payout({
            show_id: 's1',
            status: 'completed',
            amount_cents: 5000,
            stripe_transfer_id: 'tr_ok',
            created_at: '2026-06-02T00:00:00Z',
          }),
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

  it('counts unresolved paid-online pull decisions per show', () => {
    const entriesByShow = new Map<string, LedgerEntryRow[]>([
      [
        's1',
        [
          entry({ entry_status: 'scratched' }),
          entry({ entry_status: 'scratched', refund_decision: 'denied' }),
          entry({ entry_status: 'scratched', refund_amount: 25 }),
          entry({ entry_status: 'confirmed' }),
        ],
      ],
    ]);

    const rows = buildLedgerRows(shows, entriesByShow, new Map());

    expect(rows.find(row => row.showId === 's1')?.unresolvedRefundDecisionCount).toBe(1);
  });
});

describe('summarizeLedger', () => {
  it('splits completed payouts from outstanding liability', () => {
    const shows: LedgerShow[] = [
      { id: 's1', name: 'A', club_id: 'c1', clubName: 'C1', endDate: '2026-06-01' },
      { id: 's2', name: 'B', club_id: 'c2', clubName: 'C2', endDate: '2026-06-02' },
    ];
    const payoutsByShow = new Map<string, LedgerPayout[]>([
      [
        's1',
        [
          payout({
            show_id: 's1',
            amount_cents: 5000,
            status: 'completed',
            stripe_transfer_id: 't',
          }),
        ],
      ],
      ['s2', [payout({ show_id: 's2', amount_cents: 3000, status: 'pending' })]],
    ]);
    const rows = buildLedgerRows(shows, new Map(), payoutsByShow);
    expect(summarizeLedger(rows)).toEqual({
      outstandingCents: 3000,
      paidOutCents: 5000,
      unavailableShowCount: 0,
      uncollectedRefundCount: 0,
      uncollectedRefundCents: 0,
    });
  });
});

/**
 * A site admin can hold entries for a show they cannot select — `entries_select`
 * reaches them through the SECURITY DEFINER `manageable_show_ids()`, which has no
 * `deleted_at` filter, while `shows_select` ANDs one outside its role arms
 * (MYK9-233). Mapping over `shows` alone therefore drops real money from the
 * table AND from both totals, silently.
 */
describe('buildLedgerRows — shows that could not be read', () => {
  const paidEntry = (showId: string, fee: number): LedgerEntryRow => ({
    id: `e-${showId}`,
    show_id: showId,
    entry_status: 'confirmed',
    entry_fee: fee,
    payment_method: 'online',
    payment_status: 'paid',
    refund_amount: null,
    refund_decision: null,
  });

  // MYK9-233 closes the cause rather than the symptom: a site admin can now read
  // the soft-deleted show, so its id resolves instead of landing in the branch
  // above. This pins the two paths to the SAME cents — resolving the identity
  // must change what the operator sees, never what the platform owes.
  it('reports identical money whether or not the show row resolves', () => {
    const entriesByShow = new Map<string, LedgerEntryRow[]>([
      ['deleted-show', [paidEntry('deleted-show', 125)]],
    ]);

    const unresolved = summarizeLedger(buildLedgerRows([], entriesByShow, new Map()));
    const resolved = summarizeLedger(
      buildLedgerRows(
        [
          {
            id: 'deleted-show',
            name: 'Deleted Trial',
            club_id: 'c1',
            clubName: 'C1',
            endDate: '2026-06-01',
          },
        ],
        entriesByShow,
        new Map()
      )
    );

    expect(resolved.outstandingCents).toBe(unresolved.outstandingCents);
    expect(resolved.outstandingCents).toBe(12_500);
    // Only the operator-facing identity differs.
    expect(unresolved.unavailableShowCount).toBe(1);
    expect(resolved.unavailableShowCount).toBe(0);
  });

  it('keeps the money when the show row is missing', () => {
    const entriesByShow = new Map<string, LedgerEntryRow[]>([
      ['known', [paidEntry('known', 30)]],
      ['unreadable', [paidEntry('unreadable', 125)]],
    ]);
    const shows: LedgerShow[] = [
      { id: 'known', name: 'A', club_id: 'c1', clubName: 'C1', endDate: '2026-06-01' },
    ];

    const rows = buildLedgerRows(shows, entriesByShow, new Map());

    expect(rows).toHaveLength(2);
    const orphan = rows.find(r => r.showId === 'unreadable');
    expect(orphan?.showUnavailable).toBe(true);
    expect(orphan?.showName).toBeNull();
    expect(orphan?.netOwedCents).toBe(12_500);
    expect(orphan?.onlineCollectedCents).toBe(12_500);
  });

  it('counts that money in the outstanding total rather than dropping it', () => {
    const entriesByShow = new Map<string, LedgerEntryRow[]>([
      ['unreadable', [paidEntry('unreadable', 125)]],
    ]);

    const summary = summarizeLedger(buildLedgerRows([], entriesByShow, new Map()));

    expect(summary.outstandingCents).toBe(12_500);
    expect(summary.unavailableShowCount).toBe(1);
  });

  it('still reports a payout row that exists for the unreadable show', () => {
    const entriesByShow = new Map<string, LedgerEntryRow[]>([
      ['unreadable', [paidEntry('unreadable', 125)]],
    ]);
    const payoutsByShow = new Map<string, LedgerPayout[]>([
      [
        'unreadable',
        [
          payout({
            show_id: 'unreadable',
            amount_cents: 12_500,
            status: 'completed',
            stripe_transfer_id: 'tr_9',
          }),
        ],
      ],
    ]);

    const [orphan] = buildLedgerRows([], entriesByShow, payoutsByShow);

    expect(orphan.payoutStatus).toBe('completed');
    expect(orphan.stripeTransferId).toBe('tr_9');
    // A completed transfer is paid out, not outstanding — even unnamed.
    expect(summarizeLedger([orphan]).paidOutCents).toBe(12_500);
  });

  it('leaves a fully resolved ledger unchanged', () => {
    const entriesByShow = new Map<string, LedgerEntryRow[]>([['s1', [paidEntry('s1', 30)]]]);
    const shows: LedgerShow[] = [
      { id: 's1', name: 'A', club_id: 'c1', clubName: 'C1', endDate: '2026-06-01' },
    ];

    const rows = buildLedgerRows(shows, entriesByShow, new Map());

    expect(rows).toHaveLength(1);
    expect(rows[0].showUnavailable).toBe(false);
    expect(summarizeLedger(rows).unavailableShowCount).toBe(0);
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
describe('sumRefundedCents filters like sumOnlineCollectedCents', () => {
  const online = (status: string | null, fee: number, refund: number): LedgerEntryRow => ({
    id: 'e-online',
    show_id: 's1',
    entry_status: 'confirmed',
    entry_fee: fee,
    payment_method: 'online',
    payment_status: status,
    refund_amount: refund,
    refund_decision: null,
  });

  it('ignores a refund on an entry that was never collected', () => {
    // The table presents Collected / Refunds / Net owed as a subtraction. A
    // refund on a pending entry contributed to Refunds but not to Collected, so
    // the row read as "$0.00 / -$25.00 / $0.00".
    const entries = [online('pending', 25, 25)];
    expect(sumOnlineCollectedCents(entries)).toBe(0);
    expect(sumRefundedCents(entries)).toBe(0);
  });

  it('still counts a refund on a collected entry', () => {
    const entries = [online('refunded', 30, 10)];
    expect(sumOnlineCollectedCents(entries)).toBe(3000);
    expect(sumRefundedCents(entries)).toBe(1000);
  });

  it('keeps the three columns consistent for ordinary rows', () => {
    const entries = [online('paid', 40, 0), online('refunded', 30, 30)];
    const collected = sumOnlineCollectedCents(entries);
    const refunded = sumRefundedCents(entries);
    expect(collected - refunded).toBe(calculateShowPayoutCents(entries));
  });
});

describe('resolveUnsettledState', () => {
  const OWED = 5000;

  // "Not settled" collapsed three situations, hiding the only one that needs
  // the operator: a settle date that has passed with no transfer created.
  it('a settle date in the past with money owed is overdue', () => {
    expect(resolveUnsettledState('2026-06-01', '2026-08-21', OWED)).toBe('overdue');
  });

  it('a future settle date is merely scheduled', () => {
    expect(resolveUnsettledState('2026-12-01', '2026-08-21', OWED)).toBe('scheduled');
  });

  it('today is not yet overdue', () => {
    expect(resolveUnsettledState('2026-08-21', '2026-08-21', OWED)).toBe('scheduled');
  });

  it('no settle date is unscheduled, which is a show-data gap, not a payout one', () => {
    expect(resolveUnsettledState(null, '2026-08-21', OWED)).toBe('unscheduled');
  });

  it('a fully refunded show is NOT past due, however old', () => {
    // The cron skips amountCents <= 0, so no payout row is the CORRECT outcome
    // here. Calling it "Past due" would report correct behaviour as a failure.
    expect(resolveUnsettledState('2020-01-01', '2026-08-21', 0)).toBe('nothing-owed');
  });

  it('nothing owed wins over a missing settle date too', () => {
    expect(resolveUnsettledState(null, '2026-08-21', 0)).toBe('nothing-owed');
  });
});

describe('netOwedSource marks where the figure came from', () => {
  const paidEntry = (fee: number): LedgerEntryRow => ({
    id: 'e-paid',
    show_id: 's1',
    entry_status: 'confirmed',
    entry_fee: fee,
    payment_method: 'online',
    payment_status: 'paid',
    refund_amount: null,
    refund_decision: null,
  });
  const shows: LedgerShow[] = [
    {
      id: 's1',
      name: 'A',
      club_id: 'c1',
      clubName: 'C1',
      endDate: '2026-06-01',
    },
  ];

  it('is "computed" with no payout row, so the columns do subtract', () => {
    const rows = buildLedgerRows(shows, new Map([['s1', [paidEntry(30)]]]), new Map());
    expect(rows[0].netOwedSource).toBe('computed');
    expect(rows[0].onlineCollectedCents - rows[0].refundedCents).toBe(rows[0].netOwedCents);
  });

  it('is "transfer" when a live payout row supplies the amount', () => {
    const payoutsByShow = new Map<string, LedgerPayout[]>([
      ['s1', [payout({ show_id: 's1', amount_cents: 2500, status: 'completed' })]],
    ]);
    const rows = buildLedgerRows(shows, new Map([['s1', [paidEntry(30)]]]), payoutsByShow);
    expect(rows[0].netOwedSource).toBe('transfer');
    // The point of the marker: this row does NOT subtract, by design.
    expect(rows[0].onlineCollectedCents - rows[0].refundedCents).not.toBe(rows[0].netOwedCents);
  });

  it('is "computed" for a failed payout, whose stored amount is stale', () => {
    const payoutsByShow = new Map<string, LedgerPayout[]>([
      ['s1', [payout({ show_id: 's1', amount_cents: 9999, status: 'failed' })]],
    ]);
    const rows = buildLedgerRows(shows, new Map([['s1', [paidEntry(30)]]]), payoutsByShow);
    expect(rows[0].netOwedSource).toBe('computed');
    expect(rows[0].netOwedCents).toBe(3000);
  });
});

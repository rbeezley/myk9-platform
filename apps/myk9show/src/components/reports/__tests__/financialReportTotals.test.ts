import { describe, expect, it } from 'vitest';
import {
  calculateFinancialReportTotals,
  getFinancialPaymentLabel,
  isEntryIncludedInFinancialReport,
} from '../financialReportTotals';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { classifyEntryAttention } from '@/features/entry-operations/attentionClassification';
import type { ReportEntry } from '@/lib/reports/types';

function entry(overrides: Partial<ReportEntry>): ReportEntry {
  return {
    id: overrides.id ?? 'entry-1',
    armband: '101',
    runOrder: 1,
    callName: 'Buddy',
    breed: 'Lab',
    handler: 'Jane Mitchell',
    registrationNumber: null,
    checkInStatus: null,
    section: null,
    isScored: false,
    resultText: null,
    searchTimeSeconds: null,
    totalFaults: null,
    finalPlacement: null,
    entryStatus: 'accepted',
    entryFee: 50,
    paymentStatus: PaymentStatus.PAID_BY_CHECK,
    paymentMethod: 'check',
    ...overrides,
  };
}

describe('financialReportTotals', () => {
  /**
   * MYK9-639, from the finding's own measurement: one dog, entered once, $35
   * paid by check, then moved up.
   *
   * After the restructure the two rows are NOT interchangeable. The superseded
   * source still holds the money — the destination is created money-neutral and
   * only carries `movedFromEntryId` back to it — so a reader that counts the
   * destination's own figures reports $0 and one that counts both reports $70.
   */
  const MOVED_UP_PAIR: ReportEntry[] = [
    entry({
      id: 'source-moved',
      entryStatus: 'moved',
      entryFee: 35,
      paymentStatus: PaymentStatus.PAID_BY_CHECK,
      paymentMethod: 'check',
    }),
    entry({
      id: 'destination',
      entryStatus: 'confirmed',
      entryFee: 0,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: undefined,
      movedFromEntryId: 'source-moved',
    }),
  ];

  it('counts a move-up as ONE entry at the amount paid, with no Waived/Comped line (MYK9-639)', () => {
    const totals = calculateFinancialReportTotals(MOVED_UP_PAIR, 'current');

    expect(totals.summary.count).toBe(1);
    expect(totals.summary.gross).toBe(35);
    expect(totals.summary.collected).toBe(35);
    expect(totals.summary.waived).toBe(0);
    expect(totals.summary.outstanding).toBe(0);
    expect(totals.summary.netRetained).toBe(35);
    expect(totals.lines.map(line => line.entry.id)).toEqual(['destination']);
    // The line is the RUN (the destination class) but the money and the method
    // are the root's — so the secretary reconciling against the cheque sees
    // "Check", not "Pending" and not "Waived/Comped".
    expect(totals.paymentBreakdown.map(bucket => bucket.label)).toEqual(['Check']);
    expect(totals.unresolvedMoneyRoots).toEqual([]);
  });

  it('follows a DOUBLE move-up to the original payment (MYK9-639)', () => {
    const totals = calculateFinancialReportTotals(
      [
        entry({ id: 'a', entryStatus: 'moved', entryFee: 35 }),
        entry({ id: 'b', entryStatus: 'moved', entryFee: 0, movedFromEntryId: 'a' }),
        entry({ id: 'c', entryStatus: 'confirmed', entryFee: 0, movedFromEntryId: 'b' }),
      ],
      'current'
    );

    expect(totals.summary.count).toBe(1);
    expect(totals.summary.collected).toBe(35);
    expect(totals.lines.map(line => line.entry.id)).toEqual(['c']);
  });

  it('SURFACES a money root outside the report scope instead of printing $0', () => {
    // A trial-scoped report whose move-up source sits in another trial. Silence
    // here would drop a real $35 off a club's reconciliation.
    const totals = calculateFinancialReportTotals(
      [
        entry({
          id: 'destination',
          entryStatus: 'confirmed',
          entryFee: 0,
          movedFromEntryId: 'elsewhere',
        }),
      ],
      'current'
    );

    expect(totals.unresolvedMoneyRoots).toEqual([
      { entryId: 'destination', problem: 'missing-link' },
    ]);
  });

  it('surfaces an orphaned superseded row even though it is not counted', () => {
    const totals = calculateFinancialReportTotals(
      [
        entry({
          id: 'orphaned-source',
          entryStatus: 'moved',
          entryFee: 35,
          paymentStatus: PaymentStatus.PAID_BY_CHECK,
        }),
      ],
      'current'
    );

    expect(totals.lines).toEqual([]);
    expect(totals.unresolvedMoneyRoots).toEqual([
      { entryId: 'orphaned-source', problem: 'orphaned-supersession' },
    ]);
  });

  it('keeps a refund recorded on the ROOT visible through the move, and after it is reversed', () => {
    // The scenario the copy-forward shape could not survive: the exhibitor is
    // refunded while the dog sits in the destination class. The refund lives on
    // the entry that holds the Stripe intent — the source — so it reaches the
    // report through the live descendant...
    const moved = calculateFinancialReportTotals(
      [
        entry({
          id: 'source-moved',
          entryStatus: 'moved',
          entryFee: 35,
          paymentStatus: PaymentStatus.REFUNDED,
          refundAmount: 35,
        }),
        entry({
          id: 'destination',
          entryStatus: 'confirmed',
          entryFee: 0,
          paymentStatus: PaymentStatus.PENDING,
          movedFromEntryId: 'source-moved',
        }),
      ],
      'current'
    );
    expect(moved.summary.count).toBe(1);
    expect(moved.summary.refunded).toBe(35);
    expect(moved.summary.netRetained).toBe(0);

    // ...and after Move back, the source is live again and still holds it. The
    // reverse writes no money at all, so nothing can be lost in the round trip.
    const reversed = calculateFinancialReportTotals(
      [
        entry({
          id: 'source-moved',
          entryStatus: 'confirmed',
          entryFee: 35,
          paymentStatus: PaymentStatus.REFUNDED,
          refundAmount: 35,
        }),
      ],
      'current'
    );
    expect(reversed.summary.count).toBe(1);
    expect(reversed.summary.refunded).toBe(35);
    expect(reversed.summary.netRetained).toBe(0);
  });

  it('excludes the superseded source of a move-up from the current report (MYK9-639)', () => {
    expect(isEntryIncludedInFinancialReport(entry({ entryStatus: 'moved' }), 'current')).toBe(
      false
    );
  });

  it('normalizes current and legacy payment labels', () => {
    expect(getFinancialPaymentLabel(entry({ paymentStatus: PaymentStatus.PAID_BY_CHECK }))).toBe(
      'Check'
    );
    expect(
      getFinancialPaymentLabel(
        entry({ paymentStatus: PaymentStatus.PAID_BY_CASH, paymentMethod: 'cash' })
      )
    ).toBe('Cash');
    // F18: a bare 'paid' with no recorded method used to read "Online". It describes
    // 1,228 staging rows that record no method at all, and it is the one claim a
    // secretary reconciling cheques against a Stripe payout must not be handed.
    // #1222's own goal was "separate entry lifecycle status from payment status";
    // this fallback was a leftover of the conflation it set out to remove.
    expect(getFinancialPaymentLabel(entry({ paymentStatus: 'paid', paymentMethod: '' }))).toBe(
      'Paid'
    );
    expect(
      getFinancialPaymentLabel(entry({ paymentStatus: 'paid', paymentMethod: 'secretary_paid' }))
    ).toBe('Secretary Paid');
    expect(getFinancialPaymentLabel(entry({ paymentStatus: PaymentStatus.WAIVED }))).toBe(
      'Waived/Comped'
    );
  });

  it('calculates club closeout totals across payment states', () => {
    const totals = calculateFinancialReportTotals(
      [
        entry({
          id: 'check',
          entryFee: 50,
          discountAmount: 5,
          paymentStatus: PaymentStatus.PAID_BY_CHECK,
          paymentMethod: 'check',
          trialNumber: '1',
        }),
        entry({
          id: 'cash',
          entryFee: 30,
          paymentStatus: PaymentStatus.PAID_BY_CASH,
          paymentMethod: 'cash',
          trialNumber: '1',
        }),
        entry({
          id: 'pending',
          entryFee: 40,
          paymentStatus: PaymentStatus.PENDING,
          paymentMethod: '',
          trialNumber: '2',
        }),
        entry({
          id: 'waived',
          entryFee: 25,
          paymentStatus: PaymentStatus.WAIVED,
          comped: true,
          trialNumber: '2',
        }),
        entry({
          id: 'partial',
          entryFee: 60,
          paymentStatus: PaymentStatus.PARTIAL_REFUND,
          refundAmount: 20,
          paymentMethod: 'credit_card',
          trialNumber: '2',
        }),
        entry({
          id: 'refunded',
          entryFee: 35,
          paymentStatus: PaymentStatus.REFUNDED,
          paymentMethod: 'credit_card',
          trialNumber: '2',
        }),
        entry({
          id: 'waitlisted',
          entryStatus: 'waitlist',
          entryFee: 99,
          paymentStatus: PaymentStatus.PENDING,
        }),
      ],
      'current'
    );

    expect(totals.summary).toMatchObject({
      count: 6,
      gross: 240,
      discount: 5,
      waived: 25,
      collected: 170,
      refunded: 55,
      outstanding: 40,
      netRetained: 115,
    });
    expect(totals.paymentBreakdown.map(bucket => bucket.label)).toEqual([
      'Cash',
      'Check',
      'Partial Refund',
      'Pending',
      'Refunded',
      'Waived/Comped',
    ]);
  });

  it('reports waitlisted fee exposure separately', () => {
    const totals = calculateFinancialReportTotals(
      [
        entry({ id: 'accepted', entryStatus: 'accepted', entryFee: 50 }),
        entry({
          id: 'waitlisted',
          entryStatus: 'waitlist',
          entryFee: 25,
          paymentStatus: PaymentStatus.PENDING,
        }),
      ],
      'waitlist'
    );

    expect(totals.summary).toMatchObject({
      count: 1,
      gross: 25,
      outstanding: 25,
    });
  });

  it('leaves an entry row still pending outstanding, whatever its order says (MYK9-495)', () => {
    const totals = calculateFinancialReportTotals(
      [
        entry({
          id: 'mail-in-check',
          entryFee: 45,
          paymentStatus: PaymentStatus.PENDING,
          paymentMethod: 'check',
          enrollmentPaymentStatus: PaymentStatus.PAID_BY_CHECK,
        }),
      ],
      'current'
    );

    // `enrollments` is one row per (show, handler), reused by every later
    // submission, so its `paid_by_check` cannot vouch for this entry — and the
    // submit RPC already stamps entries `paid` for the order-level payment
    // methods that genuinely are settled up front.
    expect(totals.summary).toMatchObject({
      count: 1,
      gross: 45,
      collected: 0,
      outstanding: 45,
    });
  });

  it('agrees with the attention list when the ORDER is the unpaid side (MYK9-495)', () => {
    // Entry row settled by check, order still `pending`. The report used to read
    // only the entry side of the pair and call this collected while the
    // secretary's attention list called the same entry payment due. Both now
    // route through `@/utils/effectivePaymentStatus`.
    const shape = {
      paymentStatus: PaymentStatus.PAID_BY_CHECK,
      enrollmentPaymentStatus: PaymentStatus.PENDING,
    };
    const totals = calculateFinancialReportTotals(
      [entry({ id: 'order-pending', entryFee: 50, paymentMethod: 'check', ...shape })],
      'current'
    );

    expect(totals.summary).toMatchObject({ collected: 0, outstanding: 50 });
    expect(classifyEntryAttention({ entryStatus: EntryStatus.ACCEPTED, ...shape })).toEqual([
      'payment_due',
    ]);
  });

  it('keeps entry-level refunds authoritative over enrollment payment status', () => {
    const totals = calculateFinancialReportTotals(
      [
        entry({
          id: 'entry-refunded-after-check',
          entryFee: 45,
          paymentStatus: PaymentStatus.REFUNDED,
          refundAmount: 45,
          paymentMethod: 'check',
          enrollmentPaymentStatus: PaymentStatus.PAID_BY_CHECK,
        }),
      ],
      'current'
    );

    expect(totals.summary).toMatchObject({
      count: 1,
      gross: 45,
      collected: 45,
      refunded: 45,
      outstanding: 0,
      netRetained: 0,
    });
    expect(totals.paymentBreakdown.map(bucket => bucket.label)).toEqual(['Refunded']);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildEntryAccountingLine,
  calculateEntryAccounting,
  dollarsToCents,
  sumEntryAccountingLines,
} from './entryAccounting';
import { PaymentStatus } from '@/types/show-registration-types';
import type { ReportEntry } from '@/lib/reports/types';

function entry(overrides: Partial<ReportEntry>): ReportEntry {
  return {
    id: overrides.id ?? 'entry-1',
    armband: 101,
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

describe('dollarsToCents', () => {
  it('converts dollars to integer cents and clamps non-finite', () => {
    expect(dollarsToCents(50)).toBe(5000);
    expect(dollarsToCents(45.5)).toBe(4550);
    expect(dollarsToCents(Number.NaN)).toBe(0);
  });
});

describe('buildEntryAccountingLine', () => {
  it('projects a paid check entry into cents', () => {
    const line = buildEntryAccountingLine(
      entry({ entryFee: 50, discountAmount: 5, paymentStatus: PaymentStatus.PAID_BY_CHECK })
    );
    expect(line).toMatchObject({
      grossCents: 5000,
      discountCents: 500,
      netFeeCents: 4500,
      collectedCents: 4500,
      refundedCents: 0,
      outstandingCents: 0,
      waivedCents: 0,
      netRetainedCents: 4500,
      includedInPrintableReport: true,
    });
  });

  it('retains money facts for a paid-then-withdrawn entry but excludes it from the printable report', () => {
    const line = buildEntryAccountingLine(
      entry({
        id: 'paid-withdrawn',
        entryStatus: 'withdrawn',
        entryFee: 40,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        paymentMethod: 'credit_card',
      })
    );
    // Money facts are retained (collected), but it is NOT in the printable subset.
    expect(line.collectedCents).toBe(4000);
    expect(line.netRetainedCents).toBe(4000);
    expect(line.includedInPrintableReport).toBe(false);
  });

  it('captures refunded and waived cent facts', () => {
    const refunded = buildEntryAccountingLine(
      entry({
        id: 'refunded',
        entryFee: 60,
        paymentStatus: PaymentStatus.PARTIAL_REFUND,
        refundAmount: 20,
        paymentMethod: 'credit_card',
      })
    );
    expect(refunded.refundedCents).toBe(2000);
    expect(refunded.netRetainedCents).toBe(4000); // 60 collected - 20 refunded

    const waived = buildEntryAccountingLine(
      entry({ id: 'waived', entryFee: 25, paymentStatus: PaymentStatus.WAIVED, comped: true })
    );
    expect(waived.waivedCents).toBe(2500);
    expect(waived.collectedCents).toBe(0);
  });
});

describe('calculateEntryAccounting', () => {
  it('includes every financially active entry in totals while keeping the printable subset separate', () => {
    const projection = calculateEntryAccounting([
      entry({ id: 'check', entryFee: 50, paymentStatus: PaymentStatus.PAID_BY_CHECK }),
      entry({
        id: 'paid-withdrawn',
        entryStatus: 'withdrawn',
        entryFee: 40,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        paymentMethod: 'credit_card',
      }),
    ]);

    // Full totals include the withdrawn-but-paid entry ($90 collected).
    expect(projection.totals.entryCount).toBe(2);
    expect(projection.totals.collectedCents).toBe(9000);

    // Printable subset excludes the withdrawn entry ($50 collected).
    expect(projection.printableReportTotals.entryCount).toBe(1);
    expect(projection.printableReportTotals.collectedCents).toBe(5000);
  });

  it('printable subset line-sum equals the delegated printable totals', () => {
    const entries = [
      entry({ id: 'a', entryFee: 50, paymentStatus: PaymentStatus.PAID_BY_CHECK }),
      entry({ id: 'scratched', entryStatus: 'scratched', entryFee: 30 }),
      entry({
        id: 'b',
        entryFee: 45,
        discountAmount: 5,
        paymentStatus: PaymentStatus.PAID_BY_CASH,
      }),
    ];
    const projection = calculateEntryAccounting(entries);
    const includedSum = sumEntryAccountingLines(
      projection.lines.filter(line => line.includedInPrintableReport)
    );
    expect(includedSum.collectedCents).toBe(projection.printableReportTotals.collectedCents);
    expect(includedSum.grossCents).toBe(projection.printableReportTotals.grossCents);
    expect(includedSum.netRetainedCents).toBe(projection.printableReportTotals.netRetainedCents);
  });
});

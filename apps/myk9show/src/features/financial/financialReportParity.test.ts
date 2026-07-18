// Show-level parity proof (unified-financial-dashboard, MYK9-54, task 2.4).
//
// Proves the cent-based accounting projection's OVERLAPPING totals — the subset
// the printable Financial Report covers — equal calculateFinancialReportTotals
// cent-for-cent, via an INDEPENDENT path (sum the projection's per-line cents and
// compare to the report's dollar bucket converted to cents). This must pass BEFORE
// the report is wired to the shared source (task 2.5). It also proves the
// projection is strictly broader: financially active records the report filters
// out still carry their money facts in the projection.
import { describe, expect, it } from 'vitest';
import { calculateFinancialReportTotals } from '@/components/reports/financialReportTotals';
import {
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

// A representative show: paid check/cash, discounted, pending, waived, partial +
// full refund, PLUS records the printable report intentionally excludes
// (withdrawn-after-payment, scratched, waitlisted).
const SHOW_ENTRIES: ReportEntry[] = [
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
    id: 'mail-in-check',
    entryFee: 45,
    paymentStatus: PaymentStatus.PENDING,
    paymentMethod: 'check',
    enrollmentPaymentStatus: PaymentStatus.PAID_BY_CHECK,
    trialNumber: '3',
  }),
  // Records EXCLUDED from the printable report but still financially active:
  entry({
    id: 'paid-withdrawn',
    entryStatus: 'withdrawn',
    entryFee: 55,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    paymentMethod: 'credit_card',
    trialNumber: '3',
  }),
  entry({
    id: 'scratched',
    entryStatus: 'scratched',
    entryFee: 20,
    paymentStatus: PaymentStatus.PENDING,
    trialNumber: '3',
  }),
  entry({
    id: 'waitlisted',
    entryStatus: 'waitlist',
    entryFee: 99,
    paymentStatus: PaymentStatus.PENDING,
  }),
];

describe('financial report parity (task 2.4)', () => {
  it('overlapping (current-mode) totals equal the printable Financial Report cent-for-cent', () => {
    const report = calculateFinancialReportTotals(SHOW_ENTRIES, 'current').summary;
    const projection = calculateEntryAccounting(SHOW_ENTRIES, 'current');

    // Independent path: sum only the printable-included projection lines.
    const included = sumEntryAccountingLines(
      projection.lines.filter(line => line.includedInPrintableReport)
    );

    expect(included.entryCount).toBe(report.count);
    expect(included.grossCents).toBe(dollarsToCents(report.gross));
    expect(included.discountCents).toBe(dollarsToCents(report.discount));
    expect(included.waivedCents).toBe(dollarsToCents(report.waived));
    expect(included.collectedCents).toBe(dollarsToCents(report.collected));
    expect(included.refundedCents).toBe(dollarsToCents(report.refunded));
    expect(included.outstandingCents).toBe(dollarsToCents(report.outstanding));
    expect(included.netRetainedCents).toBe(dollarsToCents(report.netRetained));
  });

  it('waitlist-mode overlapping totals also match the printable report', () => {
    const report = calculateFinancialReportTotals(SHOW_ENTRIES, 'waitlist').summary;
    const projection = calculateEntryAccounting(SHOW_ENTRIES, 'waitlist');
    const included = sumEntryAccountingLines(
      projection.lines.filter(line => line.includedInPrintableReport)
    );
    expect(included.entryCount).toBe(report.count);
    expect(included.grossCents).toBe(dollarsToCents(report.gross));
    expect(included.outstandingCents).toBe(dollarsToCents(report.outstanding));
  });

  it('projection is strictly broader: withdrawn-after-payment revenue is retained but excluded from the report', () => {
    const report = calculateFinancialReportTotals(SHOW_ENTRIES, 'current').summary;
    const projection = calculateEntryAccounting(SHOW_ENTRIES, 'current');

    // The paid-then-withdrawn entry ($55) is collected in the projection totals
    // but NOT in the printable report.
    expect(projection.totals.collectedCents).toBeGreaterThan(dollarsToCents(report.collected));
    expect(projection.totals.collectedCents - projection.printableReportTotals.collectedCents).toBe(
      dollarsToCents(55)
    );
    expect(projection.totals.entryCount).toBe(SHOW_ENTRIES.length);
    expect(projection.printableReportTotals.entryCount).toBe(report.count);
  });
});

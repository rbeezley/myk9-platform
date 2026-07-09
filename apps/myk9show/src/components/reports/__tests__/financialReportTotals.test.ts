import { describe, expect, it } from 'vitest';
import {
  calculateFinancialReportTotals,
  getFinancialPaymentLabel,
  isEntryIncludedInFinancialReport,
} from '../financialReportTotals';
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

describe('financialReportTotals', () => {
  it('separates current entries from waitlisted and withdrawn entries', () => {
    expect(isEntryIncludedInFinancialReport(entry({ entryStatus: 'accepted' }), 'current')).toBe(
      true
    );
    expect(isEntryIncludedInFinancialReport(entry({ entryStatus: 'waitlist' }), 'current')).toBe(
      false
    );
    expect(isEntryIncludedInFinancialReport(entry({ entryStatus: 'withdrawn' }), 'current')).toBe(
      false
    );
    expect(isEntryIncludedInFinancialReport(entry({ entryStatus: 'waitlist' }), 'waitlist')).toBe(
      true
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
    expect(getFinancialPaymentLabel(entry({ paymentStatus: 'paid', paymentMethod: '' }))).toBe(
      'Online'
    );
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

  it('counts enrollment-paid secretary entries as collected revenue', () => {
    const totals = calculateFinancialReportTotals(
      [
        entry({
          id: 'mail-in-check',
          entryFee: 45,
          paymentStatus: PaymentStatus.PENDING,
          paymentMethod: 'check',
          enrollmentPaymentStatus: PaymentStatus.PAID_BY_CHECK,
          enrollmentPaidAmount: 45,
        }),
      ],
      'current'
    );

    expect(totals.summary).toMatchObject({
      count: 1,
      gross: 45,
      collected: 45,
      outstanding: 0,
      netRetained: 45,
    });
    expect(totals.paymentBreakdown.map(bucket => bucket.label)).toEqual(['Check']);
  });
});

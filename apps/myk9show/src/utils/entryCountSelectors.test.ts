import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import {
  countRawEntryManagementPendingBucket,
  getEntryManagementCountSummary,
} from './entryCountSelectors';
import { calculateFinancialReportTotals } from '@/components/reports/financialReportTotals';
import type { ReportEntry } from '@/lib/reports/types';
import type { EntryManagementEntry } from '@/types/entry-management-types';

function reportEntry(overrides: Partial<ReportEntry>): ReportEntry {
  return {
    id: overrides.id ?? 'report-entry',
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
    ...overrides,
  };
}

function entry(overrides: Partial<EntryManagementEntry>): EntryManagementEntry {
  return {
    id: 'entry',
    registrationId: 'reg',
    entryNumber: '101',
    showId: 'show',
    dogId: 'dog',
    dogName: 'Dog',
    ownerName: 'Owner',
    ownerEmail: 'owner@example.com',
    handlerName: 'Handler',
    classes: [],
    totalFee: 0,
    paidAmount: 0,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-07-01T00:00:00Z'),
    lastUpdated: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

describe('entry count selectors', () => {
  it('reads ONE entry and $35 for a moved-up dog (MYK9-639)', () => {
    // The money stayed on the superseded source; the destination is
    // money-neutral. Counting both reported "2 entries"; reading the
    // destination's own figures would have reported $0 revenue and $0 owed.
    const { stats, tabCounts } = getEntryManagementCountSummary([
      entry({
        id: 'source-moved',
        entryStatus: EntryStatus.MOVED,
        totalFee: 35,
        paidAmount: 35,
        paymentStatus: PaymentStatus.PAID_BY_CHECK,
      }),
      entry({
        id: 'destination',
        entryStatus: EntryStatus.ACCEPTED,
        totalFee: 0,
        paidAmount: 0,
        paymentStatus: PaymentStatus.PENDING,
        movedFromEntryId: 'source-moved',
      }),
    ]);

    expect(stats.total).toBe(1);
    expect(tabCounts.all).toBe(1);
    expect(stats.revenue).toBe(35);
    expect(stats.outstanding).toBe(0);
  });

  it('does not flag a moved-up dog as an unpaid entry needing attention', () => {
    // The destination's own `payment_status` is `pending` by construction, so
    // the issue classifier has to read the ROOT or every move-up would raise a
    // false "payment outstanding".
    const { stats } = getEntryManagementCountSummary([
      entry({
        id: 'source-moved',
        entryStatus: EntryStatus.MOVED,
        totalFee: 35,
        paidAmount: 35,
        paymentStatus: PaymentStatus.PAID_BY_CHECK,
      }),
      entry({
        id: 'destination',
        entryStatus: EntryStatus.ACCEPTED,
        totalFee: 0,
        paidAmount: 0,
        paymentStatus: PaymentStatus.PENDING,
        movedFromEntryId: 'source-moved',
      }),
    ]);

    expect(stats.outstanding).toBe(0);
  });
  it('counts raw pending-bucket statuses the same way Entry Management maps them', () => {
    const rawEntries = [
      { entry_status: 'submitted' },
      { entry_status: 'paid' },
      { entry_status: 'promotion-expired' },
      { entry_status: null },
      { entry_status: '' },
      { entry_status: 'confirmed' },
      { entry_status: 'waitlisted' },
      { entry_status: 'withdrawn' },
    ];
    const managementEntries = rawEntries.map((raw, index) =>
      entry({
        id: `entry-${index}`,
        entryStatus:
          raw.entry_status === 'confirmed'
            ? EntryStatus.ACCEPTED
            : raw.entry_status === 'waitlisted'
              ? EntryStatus.WAITLIST
              : raw.entry_status === 'withdrawn'
                ? EntryStatus.CANCELLED
                : EntryStatus.PENDING,
      })
    );

    expect(countRawEntryManagementPendingBucket(rawEntries)).toBe(5);
    expect(getEntryManagementCountSummary(managementEntries).tabCounts.pending).toBe(5);
  });

  it('sums outstanding to match the Financial Report total for equivalent fixture data', () => {
    const financialTotals = calculateFinancialReportTotals([
      reportEntry({ id: 'pending', entryFee: 50, paymentStatus: PaymentStatus.PENDING }),
      reportEntry({ id: 'paid', entryFee: 30, paymentStatus: PaymentStatus.PAID_BY_CHECK }),
      reportEntry({
        id: 'waived',
        entryFee: 20,
        paymentStatus: PaymentStatus.WAIVED,
        comped: true,
      }),
    ]);

    const managementEntries = [
      entry({ id: 'pending', totalFee: 50, paymentStatus: PaymentStatus.PENDING }),
      entry({ id: 'paid', totalFee: 30, paymentStatus: PaymentStatus.PAID_BY_CHECK }),
      entry({
        id: 'waived',
        totalFee: 20,
        paymentStatus: PaymentStatus.WAIVED,
        comped: true,
      }),
    ];

    const { stats } = getEntryManagementCountSummary(managementEntries);

    expect(financialTotals.summary.outstanding).toBe(50);
    expect(stats.outstanding).toBe(financialTotals.summary.outstanding);
  });

  it('excludes not-accepted/withdrawn entries from outstanding, matching the Financial Report', () => {
    const financialTotals = calculateFinancialReportTotals([
      reportEntry({ id: 'pending', entryFee: 50, paymentStatus: PaymentStatus.PENDING }),
      reportEntry({
        id: 'not-accepted',
        entryFee: 40,
        entryStatus: 'not_accepted',
        paymentStatus: PaymentStatus.PENDING,
      }),
      reportEntry({
        id: 'withdrawn',
        entryFee: 35,
        entryStatus: 'withdrawn',
        paymentStatus: PaymentStatus.PENDING,
      }),
    ]);

    const managementEntries = [
      entry({ id: 'pending', totalFee: 50, paymentStatus: PaymentStatus.PENDING }),
      entry({
        id: 'not-accepted',
        totalFee: 40,
        entryStatus: EntryStatus.REJECTED,
        paymentStatus: PaymentStatus.PENDING,
      }),
      entry({
        id: 'withdrawn',
        totalFee: 35,
        entryStatus: EntryStatus.CANCELLED,
        paymentStatus: PaymentStatus.PENDING,
      }),
    ];

    const { stats } = getEntryManagementCountSummary(managementEntries);

    expect(financialTotals.summary.outstanding).toBe(50);
    expect(stats.outstanding).toBe(financialTotals.summary.outstanding);
  });

  it('reads zero outstanding for a fully settled show', () => {
    const managementEntries = [
      entry({ id: 'paid-1', totalFee: 50, paymentStatus: PaymentStatus.PAID_BY_CHECK }),
      entry({ id: 'paid-2', totalFee: 30, paymentStatus: PaymentStatus.PAID_ONLINE }),
      entry({
        id: 'waived',
        totalFee: 20,
        paymentStatus: PaymentStatus.WAIVED,
        comped: true,
      }),
    ];

    const { stats } = getEntryManagementCountSummary(managementEntries);

    expect(stats.outstanding).toBe(0);
  });
});

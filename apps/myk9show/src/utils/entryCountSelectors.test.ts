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
    const financialTotals = calculateFinancialReportTotals(
      [
        reportEntry({ id: 'pending', entryFee: 50, paymentStatus: PaymentStatus.PENDING }),
        reportEntry({ id: 'paid', entryFee: 30, paymentStatus: PaymentStatus.PAID_BY_CHECK }),
        reportEntry({
          id: 'waived',
          entryFee: 20,
          paymentStatus: PaymentStatus.WAIVED,
          comped: true,
        }),
      ],
      'current'
    );

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

  it('excludes waitlisted/withdrawn entries from outstanding, matching the Financial Report', () => {
    const financialTotals = calculateFinancialReportTotals(
      [
        reportEntry({ id: 'pending', entryFee: 50, paymentStatus: PaymentStatus.PENDING }),
        reportEntry({
          id: 'waitlisted',
          entryFee: 40,
          entryStatus: 'waitlist',
          paymentStatus: PaymentStatus.PENDING,
        }),
        reportEntry({
          id: 'withdrawn',
          entryFee: 35,
          entryStatus: 'withdrawn',
          paymentStatus: PaymentStatus.PENDING,
        }),
      ],
      'current'
    );

    const managementEntries = [
      entry({ id: 'pending', totalFee: 50, paymentStatus: PaymentStatus.PENDING }),
      entry({
        id: 'waitlisted',
        totalFee: 40,
        entryStatus: EntryStatus.WAITLIST,
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

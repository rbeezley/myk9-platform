/**
 * MYK9-1637: `entries.card_paid` is server-derived and has to survive every
 * hand-written hop between the replicated view row and the surfaces that read
 * it. Each assertion starts from the VIEW row key (`card_paid`) so a dropped
 * projection at any hop turns it red.
 */
import { describe, expect, it } from 'vitest';

import { PaymentStatus } from '@/types/show-registration-types';
import { calculateFinancialReportTotals } from '@/components/reports/financialReportTotals';
import { mapReportEntries } from '@/pages/secretary/ReportsPage/reportDataMapping';
import { mapReplicatedEntryToDbRow } from '@/services/mappers/entryMappers';
import { getEntryPaidAmount } from '@/utils/entryManagementUtils';
import type { ReportDbEntry } from '@/lib/reports/types';

import { rowToEntry, type EntryRow } from './ReplicatedEntriesTable.mapper';

function viewRow(cardPaid: boolean | null | undefined): EntryRow {
  return {
    id: 'entry-1',
    entry_status: 'confirmed',
    payment_status: 'paid',
    payment_method: 'online',
    entry_fee: 50,
    ...(cardPaid === undefined ? {} : { card_paid: cardPaid }),
  } as unknown as EntryRow;
}

describe('card_paid survives the replica hops (MYK9-1637)', () => {
  it('rowToEntry carries the view column under both key conventions', () => {
    const entry = rowToEntry(viewRow(true));
    expect(entry.cardPaid).toBe(true);
    expect(entry.card_paid).toBe(true);
  });

  it('rowToEntry leaves it undefined when the view does not project the column yet', () => {
    expect(rowToEntry(viewRow(undefined)).cardPaid).toBeUndefined();
  });

  it('mapReplicatedEntryToDbRow keeps it on the DbEntry the reports read', () => {
    expect(mapReplicatedEntryToDbRow(rowToEntry(viewRow(true))).card_paid).toBe(true);
    expect(mapReplicatedEntryToDbRow(rowToEntry(viewRow(undefined))).card_paid).toBe(false);
  });

  it('reaches the financial report as collected money under a reopened order', () => {
    const dbRow = {
      ...mapReplicatedEntryToDbRow(rowToEntry(viewRow(true))),
      registration: { payment_status: 'pending' },
    } as unknown as ReportDbEntry;
    const [reportEntry] = mapReportEntries([dbRow]);

    expect(reportEntry.cardPaid).toBe(true);
    const totals = calculateFinancialReportTotals([reportEntry]);
    expect(totals.summary.collected).toBe(50);
    expect(totals.summary.outstanding).toBe(0);
  });

  it('the Entry Management money function counts it as paid', () => {
    expect(
      getEntryPaidAmount({
        paymentStatus: PaymentStatus.PAID_ONLINE,
        enrollmentPaymentStatus: PaymentStatus.PENDING,
        cardPaid: rowToEntry(viewRow(true)).cardPaid === true,
        totalFee: 50,
        refundAmount: null,
      })
    ).toBe(50);
  });
});

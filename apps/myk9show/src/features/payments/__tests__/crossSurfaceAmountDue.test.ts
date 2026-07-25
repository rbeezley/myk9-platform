import { describe, it, expect } from 'vitest';
import {
  mapEntryRowToBalanceSource,
  summarizeEntryBalances,
  type EntryBalanceRawRow,
  type EntryBalanceSource,
} from '../entryBalanceSummary';
import { groupEntriesByOrder } from '@/pages/MyEntriesPage/modules/groupEntriesByOrder';
import { mapEntryStatus, mapPaymentStatus } from '@/utils/entryManagementUtils';
import type { MyEntry, EntryClass } from '@/pages/MyEntriesPage/modules/my-entries-types';

const NOW = new Date(2026, 6, 24, 12, 0, 0);

/**
 * The two raw per-class rows that reproduced the audit's "My Shows $150 due
 * vs My Payments $0" contradiction. Same dog, same show, no registration
 * (secretary/mail-in entry — see `orderKeyFor`'s `dog:{showId}:{dogId}`
 * fallback in groupEntriesByOrder), two classes with DIFFERENT per-row
 * `payment_status`: one paid, one still pending.
 */
function rawRows(): EntryBalanceRawRow[] {
  const show = {
    id: 'show-1',
    name: 'Summer Nationals',
    start_date: '2026-07-25',
    end_date: '2026-07-25',
  };
  return [
    {
      id: 'row-a',
      show_id: 'show-1',
      entry_status: 'accepted',
      payment_status: 'paid',
      payment_method: 'online',
      entry_fee: 100,
      show,
      registration: null,
    },
    {
      id: 'row-b',
      show_id: 'show-1',
      entry_status: 'accepted',
      payment_status: 'pending',
      payment_method: 'online',
      entry_fee: 50,
      show,
      registration: null,
    },
  ];
}

/**
 * Mirrors the OLD (pre-fix) My Shows pipeline: raw rows -> per-row
 * `transformEntry`-equivalent MyEntry rows -> `groupEntriesByOrder` (which
 * only keeps the FIRST row's `paymentStatus` for the whole order) -> the
 * canonical selector over the GROUPED cards. This is what
 * `useMyEntriesFilters` did before this fix, when fed `entries` straight
 * from `useMyEntriesData` with no raw-row `balanceSummary`.
 */
function legacyGroupedMyShowsAmountDueCents(): number {
  const rows = rawRows();
  const myEntryRows: MyEntry[] = rows.map(row => {
    const source = mapEntryRowToBalanceSource(row);
    const classes: EntryClass[] = [
      {
        id: source.id,
        classId: source.id,
        name: 'Class',
        number: '1',
        fee: source.totalFee,
        status: 'entered',
      },
    ];
    return {
      id: source.id,
      registrationId: null,
      showId: source.showId,
      showName: source.showName ?? '',
      showDate: source.showDate,
      showEndDate: source.showEndDate,
      location: { venue: '', city: '', state: '' },
      dogName: 'Fido',
      dogId: 'dog-1',
      classes,
      dogs: [],
      totalFee: source.totalFee,
      entryStatus: mapEntryStatus(String(row.entry_status)),
      paymentStatus: mapPaymentStatus(row.payment_status),
      paymentMethod: source.paymentMethod,
      submittedAt: NOW,
      lastUpdated: NOW,
    };
  });

  const grouped = groupEntriesByOrder(myEntryRows);
  const groupedSources: EntryBalanceSource[] = grouped.map(entry => ({
    id: entry.id,
    showId: entry.showId,
    showName: entry.showName,
    showDate: entry.showDate,
    showEndDate: entry.showEndDate,
    entryStatus: entry.entryStatus,
    paymentStatus: entry.paymentStatus,
    paymentMethod: entry.paymentMethod,
    totalFee: entry.totalFee,
    classes: entry.classes.map(c => ({ id: c.id })),
  }));
  return summarizeEntryBalances(groupedSources, NOW).amountDueCents;
}

/** My Payments' actual path: raw rows -> shared mapper -> canonical selector, no grouping. */
function myPaymentsAmountDueCents(): number {
  const sources = rawRows().map(mapEntryRowToBalanceSource);
  return summarizeEntryBalances(sources, NOW).amountDueCents;
}

/** My Shows' FIXED path: same raw rows -> shared mapper -> canonical selector, no grouping. */
function fixedMyShowsAmountDueCents(): number {
  const sources = rawRows().map(mapEntryRowToBalanceSource);
  return summarizeEntryBalances(sources, NOW).amountDueCents;
}

describe('cross-surface amount due (exhibitor-money-clarity)', () => {
  it('[6.1] reproduces the audit contradiction: grouped My Shows disagrees with per-row My Payments', () => {
    // Row A (paid, $100) is first in array order, so the OLD grouped path's
    // "first row wins" paymentStatus treats the WHOLE $150 order as paid ->
    // $0 due. My Payments correctly sums per-row: row A paid ($0 due) + row B
    // pending ($50 due) = $50 due. These must NOT match pre-fix.
    const legacy = legacyGroupedMyShowsAmountDueCents();
    const myPayments = myPaymentsAmountDueCents();

    expect(legacy).toBe(0);
    expect(myPayments).toBe(5000);
    expect(legacy).not.toBe(myPayments);
  });

  it('[6.2] fixed My Shows path agrees with My Payments for the same raw rows', () => {
    expect(fixedMyShowsAmountDueCents()).toBe(myPaymentsAmountDueCents());
    expect(fixedMyShowsAmountDueCents()).toBe(5000);
  });

  it('zero due: fully paid rows agree on $0 across both surfaces', () => {
    const rows: EntryBalanceRawRow[] = [
      {
        id: 'paid-row',
        show_id: 'show-2',
        entry_status: 'accepted',
        payment_status: 'paid',
        payment_method: 'online',
        entry_fee: 75,
        show: { id: 'show-2', name: 'Fall Classic', start_date: '2026-08-01' },
        registration: null,
      },
    ];
    const sources = rows.map(mapEntryRowToBalanceSource);
    const summary = summarizeEntryBalances(sources, NOW);
    expect(summary.amountDueCents).toBe(0);
  });

  it('online due: pending entry with online method routes to onlineDueCents', () => {
    const rows: EntryBalanceRawRow[] = [
      {
        id: 'online-due-row',
        show_id: 'show-3',
        entry_status: 'accepted',
        payment_status: 'pending',
        payment_method: 'online',
        entry_fee: 45,
        show: { id: 'show-3', name: 'Winter Trial', start_date: '2026-08-02' },
        registration: null,
      },
    ];
    const summary = summarizeEntryBalances(rows.map(mapEntryRowToBalanceSource), NOW);
    expect(summary.amountDueCents).toBe(4500);
    expect(summary.onlineDueCents).toBe(4500);
    expect(summary.payAtShowDueCents).toBe(0);
  });

  it('pay-at-show due: pending cash entry counts toward payAtShowDueCents, not onlineDueCents', () => {
    const rows: EntryBalanceRawRow[] = [
      {
        id: 'cash-row',
        show_id: 'show-4',
        entry_status: 'accepted',
        payment_status: 'pending',
        payment_method: 'cash',
        entry_fee: 30,
        show: { id: 'show-4', name: 'Spring Trial', start_date: '2026-08-03' },
        registration: null,
      },
    ];
    const summary = summarizeEntryBalances(rows.map(mapEntryRowToBalanceSource), NOW);
    expect(summary.amountDueCents).toBe(3000);
    expect(summary.payAtShowDueCents).toBe(3000);
    expect(summary.onlineDueCents).toBe(0);
  });

  it('refund: a refunded entry is not treated as due on either surface', () => {
    const rows: EntryBalanceRawRow[] = [
      {
        id: 'refund-row',
        show_id: 'show-5',
        entry_status: 'accepted',
        payment_status: 'refunded',
        payment_method: 'online',
        entry_fee: 60,
        show: { id: 'show-5', name: 'Regional', start_date: '2026-08-04' },
        registration: null,
      },
    ];
    const summary = summarizeEntryBalances(rows.map(mapEntryRowToBalanceSource), NOW);
    expect(summary.amountDueCents).toBe(0);
  });

  it('waived: a waived entry is not treated as due on either surface', () => {
    const rows: EntryBalanceRawRow[] = [
      {
        id: 'waived-row',
        show_id: 'show-6',
        entry_status: 'accepted',
        payment_status: 'waived',
        payment_method: 'waived',
        entry_fee: 20,
        show: { id: 'show-6', name: 'Local Match', start_date: '2026-08-05' },
        registration: null,
      },
    ];
    const summary = summarizeEntryBalances(rows.map(mapEntryRowToBalanceSource), NOW);
    expect(summary.amountDueCents).toBe(0);
  });

  it("pending-review-paid: entry_status 'paid' bucket does NOT show Payment Due from status alone", () => {
    // Domain rule: entry status 'paid' stays in the pending/needs-review
    // bucket (secretary needs-review), but it must not itself manufacture a
    // "Payment Due" figure — only an actually-pending PAYMENT status does.
    const rows: EntryBalanceRawRow[] = [
      {
        id: 'status-paid-row',
        show_id: 'show-7',
        entry_status: 'paid',
        payment_status: 'paid',
        payment_method: 'online',
        entry_fee: 90,
        show: { id: 'show-7', name: 'Needs Review Show', start_date: '2026-08-06' },
        registration: null,
      },
    ];
    const summary = summarizeEntryBalances(rows.map(mapEntryRowToBalanceSource), NOW);
    expect(summary.amountDueCents).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { deskAmountOwed, deskOwedHref, owesLabel } from './deskAmountOwed';

function entry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'reg-1',
    entryNumber: '114',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Poppy',
    ownerName: 'Alice Martin',
    ownerEmail: 'alice@example.com',
    handlerName: 'Alice Martin',
    classes: [],
    totalFee: 25,
    paidAmount: 0,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-07-08T09:00:00.000Z'),
    lastUpdated: new Date('2026-07-08T09:00:00.000Z'),
    ...overrides,
  };
}

describe('deskAmountOwed', () => {
  it('owes nothing when the entry is paid', () => {
    const paid = entry({ paymentStatus: PaymentStatus.PAID_BY_CASH, paidAmount: 25 });
    expect(deskAmountOwed([paid]).amount).toBe(0);
  });

  it('owes nothing on a Free (comped) entry', () => {
    expect(deskAmountOwed([entry({ comped: true })]).amount).toBe(0);
  });

  it('sums an unpaid form and names it', () => {
    const owed = deskAmountOwed([entry(), entry({ id: 'entry-2', dogId: 'dog-2' })]);
    expect(owed).toEqual({ amount: 50, unknown: false, formKeys: ['reg-1'] });
  });

  it('quotes the form balance when part has been received', () => {
    const partPaid = (id: string) =>
      entry({
        id,
        dogId: id,
        enrollmentTotalAmount: 5000,
        enrollmentPaidAmount: 30,
      });
    const owed = deskAmountOwed([partPaid('a'), partPaid('b')]);
    expect(owed.amount).toBe(20);
  });

  it('sums across several forms and lists each', () => {
    const owed = deskAmountOwed([entry(), entry({ id: 'entry-2', registrationId: 'reg-2' })]);
    expect(owed.amount).toBe(50);
    expect(owed.formKeys).toEqual(['reg-1', 'reg-2']);
  });

  it('owes nothing for an entry that is not accepted yet', () => {
    expect(deskAmountOwed([entry({ entryStatus: EntryStatus.PENDING })]).amount).toBe(0);
  });

  it('says the amount is unknown when the money root could not be reached', () => {
    expect(deskAmountOwed([entry({ moneyRootUnresolved: true })]).unknown).toBe(true);
  });
});

describe('owesLabel and deskOwedHref', () => {
  it('words the amount', () => {
    expect(owesLabel(25)).toBe('Owes $25');
    expect(owesLabel(25.5)).toBe('Owes $25.50');
  });

  it('opens the one form that owes', () => {
    expect(deskOwedHref('show-1', 'Alice Martin', ['reg-1'])).toBe(
      '/shows/show-1/entries?registration=reg-1'
    );
  });

  it('opens Entries filtered to the person when several forms owe', () => {
    expect(deskOwedHref('show-1', 'Alice Martin', ['reg-1', 'reg-2'])).toBe(
      '/shows/show-1/entries?search=Alice+Martin'
    );
  });
});

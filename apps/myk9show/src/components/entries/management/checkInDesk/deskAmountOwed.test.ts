import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { deskOwedByPayer, deskOwedHref, owesLabel } from './deskAmountOwed';

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
    ownerId: 'owner-1',
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

const owedFor = (entries: EntryManagementEntry[], payerId: string) =>
  deskOwedByPayer(entries).get(payerId);

describe('deskOwedByPayer', () => {
  it('owes nothing when the form is paid', () => {
    const paid = entry({ paymentStatus: PaymentStatus.PAID_BY_CASH, paidAmount: 25 });
    expect(owedFor([paid], 'owner-1')).toBeUndefined();
  });

  it('puts a form on its payer, not on the handler running the dog', () => {
    const forms = [
      entry({ id: 'a', registrationId: 'reg-a', enrollmentPayerId: 'client-a', handlerId: 'pro' }),
      entry({ id: 'b', registrationId: 'reg-b', enrollmentPayerId: 'client-b', handlerId: 'pro' }),
    ];
    const owed = deskOwedByPayer(forms);
    expect(owed.get('pro')).toBeUndefined();
    expect(owed.get('client-a')).toEqual({ amount: 25, unknown: false, formKeys: ['reg-a'] });
    expect(owed.get('client-b')).toEqual({ amount: 25, unknown: false, formKeys: ['reg-b'] });
  });

  it('counts a form split across two handlers once, at the form due', () => {
    const slice = (id: string, handlerId: string) =>
      entry({
        id,
        handlerId,
        enrollmentPayerId: 'payer',
        enrollmentTotalAmount: 5000,
        enrollmentPaidAmount: 0,
      });
    const owed = deskOwedByPayer([slice('a', 'h1'), slice('b', 'h2')]);
    expect(owed.get('payer')).toEqual({ amount: 50, unknown: false, formKeys: ['reg-1'] });
    expect(owed.size).toBe(1);
  });

  it('quotes the form balance when part has been received', () => {
    const partPaid = (id: string) =>
      entry({ id, dogId: id, enrollmentTotalAmount: 5000, enrollmentPaidAmount: 30 });
    expect(owedFor([partPaid('a'), partPaid('b')], 'owner-1')?.amount).toBe(20);
  });

  it('counts a waitlisted entry with an accepted one, as the form does', () => {
    const owed = owedFor(
      [entry(), entry({ id: 'w', dogId: 'dog-2', entryStatus: EntryStatus.WAITLIST })],
      'owner-1'
    );
    expect(owed?.amount).toBe(50);
  });

  it('shows the waitlisted fee when the accepted entry is paid', () => {
    const paid = entry({ paymentStatus: PaymentStatus.PAID_BY_CASH, paidAmount: 25 });
    const waitlisted = entry({ id: 'w', dogId: 'dog-2', entryStatus: EntryStatus.WAITLIST });
    expect(owedFor([paid, waitlisted], 'owner-1')?.amount).toBe(25);
  });

  it('sums across several forms and lists each', () => {
    const owed = owedFor([entry(), entry({ id: 'entry-2', registrationId: 'reg-2' })], 'owner-1');
    expect(owed).toEqual({ amount: 50, unknown: false, formKeys: ['reg-1', 'reg-2'] });
  });

  it('says the amount is unknown when the money root could not be reached', () => {
    expect(owedFor([entry({ moneyRootUnresolved: true })], 'owner-1')?.unknown).toBe(true);
  });
});

describe('owesLabel and deskOwedHref', () => {
  it('always shows two decimals', () => {
    expect(owesLabel(25)).toBe('Owes $25.00');
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

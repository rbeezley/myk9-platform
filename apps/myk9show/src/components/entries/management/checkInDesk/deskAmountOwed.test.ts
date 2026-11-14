import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { groupEntriesByEnrollment } from '@/utils/enrollmentGrouping';
import { enrollmentRemainingDollars } from '../enrollmentPayment';
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

/** An online-checkout form: no enrollment row, grouped by its Stripe order. */
const online = (overrides: Partial<EntryManagementEntry> = {}) =>
  entry({ registrationId: '', stripePaymentIntentId: 'pi_1', ...overrides });

const owedFor = (entries: EntryManagementEntry[], payerId: string) =>
  deskOwedByPayer(entries).get(payerId);

describe('deskOwedByPayer', () => {
  it('owes nothing when the form is paid', () => {
    const paid = entry({
      paymentStatus: PaymentStatus.PAID_BY_CASH,
      paidAmount: 25,
      enrollmentTotalAmount: 2500,
      enrollmentPaidAmount: 25,
    });
    expect(owedFor([paid], 'owner-1')).toBeUndefined();
  });

  it('puts a form on its payer, not on the handler running the dog', () => {
    const form = (id: string, payer: string) =>
      entry({
        id,
        registrationId: `reg-${id}`,
        enrollmentPayerId: payer,
        handlerId: 'pro',
        enrollmentTotalAmount: 2500,
        enrollmentPaidAmount: 0,
      });
    const forms = [form('a', 'client-a'), form('b', 'client-b')];
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
      [online(), online({ id: 'w', dogId: 'dog-2', entryStatus: EntryStatus.WAITLIST })],
      'owner-1'
    );
    expect(owed?.amount).toBe(50);
  });

  it('shows the waitlisted fee when the accepted entry is paid', () => {
    const paid = online({ paymentStatus: PaymentStatus.PAID_BY_CASH, paidAmount: 25 });
    const waitlisted = online({ id: 'w', dogId: 'dog-2', entryStatus: EntryStatus.WAITLIST });
    expect(owedFor([paid, waitlisted], 'owner-1')?.amount).toBe(25);
  });

  it('sums across several forms and lists each', () => {
    const loaded = { enrollmentTotalAmount: 2500, enrollmentPaidAmount: 0 };
    const owed = owedFor(
      [entry(loaded), entry({ ...loaded, id: 'entry-2', registrationId: 'reg-2' })],
      'owner-1'
    );
    expect(owed).toEqual({ amount: 50, unknown: false, formKeys: ['reg-1', 'reg-2'] });
  });

  it('says the amount is unknown when the money root could not be reached', () => {
    expect(owedFor([entry({ moneyRootUnresolved: true })], 'owner-1')?.unknown).toBe(true);
  });

  describe('when the enrollment row was expected but did not load (offline)', () => {
    const notLoaded = (overrides: Partial<EntryManagementEntry> = {}) =>
      entry({
        registrationId: 'reg-1',
        handlerId: 'pro',
        enrollmentPayerId: null,
        enrollmentTotalAmount: null,
        enrollmentPaidAmount: null,
        ...overrides,
      });

    it('never quotes a figure for a part-paid form', () => {
      const owed = deskOwedByPayer([
        notLoaded({ id: 'a', dogId: 'a', paidAmount: 0 }),
        notLoaded({ id: 'b', dogId: 'b', paidAmount: 0 }),
      ]);
      expect(owed.get('owner-1')).toEqual({ amount: 0, unknown: true, formKeys: ['reg-1'] });
    });

    it('says so on a form whose entries look paid, since held money cannot be traced', () => {
      const paid = notLoaded({ paymentStatus: PaymentStatus.PAID_BY_CASH, paidAmount: 25 });
      expect(owedFor([paid], 'owner-1')?.unknown).toBe(true);
    });

    it('does not move the form off a pro handler who may have placed it', () => {
      const owed = deskOwedByPayer([notLoaded()]);
      expect(owed.get('pro')).toEqual({ amount: 0, unknown: true, formKeys: ['reg-1'] });
      expect(owed.get('owner-1')).toEqual({ amount: 0, unknown: true, formKeys: ['reg-1'] });
    });

    it('marks only the payer when the payer is known but the totals are not', () => {
      const owed = deskOwedByPayer([notLoaded({ enrollmentPayerId: 'payer' })]);
      expect(owed.get('payer')?.unknown).toBe(true);
      expect(owed.has('pro')).toBe(false);
      expect(owed.has('owner-1')).toBe(false);
    });
  });

  describe('when a move-up root is not in the read', () => {
    const loaded = {
      enrollmentPayerId: 'payer',
      enrollmentTotalAmount: 2500,
      enrollmentPaidAmount: 25,
    };

    it('says unknown for a destination whose root is missing', () => {
      const destination = entry({ ...loaded, id: 'dest', movedFromEntryId: 'gone' });
      expect(owedFor([destination], 'payer')).toEqual({
        amount: 0,
        unknown: true,
        formKeys: ['reg-1'],
      });
    });

    it('says unknown for a moved row nobody claims', () => {
      const orphan = entry({
        ...loaded,
        id: 'moved',
        registrationId: 'reg-2',
        entryStatus: EntryStatus.MOVED,
      });
      const paidForm = entry({ ...loaded, id: 'paid', dogId: 'dog-2' });
      expect(owedFor([paidForm, orphan], 'payer')).toEqual({
        amount: 0,
        unknown: true,
        formKeys: ['reg-2'],
      });
    });
  });
});

/**
 * The desk's figure is the entry form footer's (`$X due` when `enrollmentRemainingDollars` is
 * above zero, else "Paid in full") in every case MYK9-1961 covers (MYK9-1937 owner decision,
 * 2026-11-13).
 */
describe('deskOwedByPayer matches the entry form footer (MYK9-1961 cases)', () => {
  const enrolled = (overrides: Partial<EntryManagementEntry>) =>
    entry({
      registrationId: 'enr-1',
      enrollmentPaymentStatus: PaymentStatus.PENDING,
      ...overrides,
    });
  const refunded = { paymentStatus: PaymentStatus.REFUNDED, rawPaymentStatus: 'refunded' };
  const comped = { paymentStatus: PaymentStatus.WAIVED, rawPaymentStatus: 'waived', comped: true };

  const cases: Array<[string, EntryManagementEntry[], number]> = [
    [
      'a full desk refund',
      [
        enrolled({
          ...refunded,
          enrollmentPaymentStatus: PaymentStatus.REFUNDED,
          enrollmentTotalAmount: 0,
          enrollmentPaidAmount: 25,
          enrollmentRefundAmount: 25,
        }),
      ],
      0,
    ],
    [
      'a partial desk refund',
      ['a', 'b'].map(id =>
        enrolled({
          ...refunded,
          id,
          dogId: id,
          enrollmentPaymentStatus: PaymentStatus.PARTIAL_REFUND,
          enrollmentTotalAmount: 0,
          enrollmentPaidAmount: 50,
          enrollmentRefundAmount: 10,
        })
      ),
      0,
    ],
    [
      'a Stripe refund with no enrollment row, beside a sibling that owes',
      [
        online({
          ...refunded,
          id: 'refunded',
          refundAmount: 10,
          paidAmount: 15,
        }),
        online({ id: 'owing', dogId: 'dog-2' }),
      ],
      25,
    ],
    [
      'a Stripe refund on an enrollment row',
      [
        enrolled({
          ...refunded,
          enrollmentPaymentStatus: PaymentStatus.PAID_ONLINE,
          enrollmentTotalAmount: 0,
          enrollmentPaidAmount: 0,
          refundAmount: 25,
          refundedAt: '2026-11-01T00:00:00Z',
        }),
      ],
      0,
    ],
    ['a comped entry with no enrollment row', [online(comped)], 0],
    [
      'a comped entry on an enrollment row',
      [enrolled({ ...comped, enrollmentTotalAmount: 0, enrollmentPaidAmount: 0 })],
      0,
    ],
    [
      'an add-on covered by money the form still holds',
      ['held', 'added'].map(id =>
        enrolled({ id, dogId: id, enrollmentTotalAmount: 5000, enrollmentPaidAmount: 60 })
      ),
      0,
    ],
    [
      'an add-on the held money does not cover',
      [
        enrolled({
          ...refunded,
          id: 'refunded',
          enrollmentTotalAmount: 3000,
          enrollmentPaidAmount: 25,
          enrollmentRefundAmount: 25,
        }),
        enrolled({
          id: 'added',
          dogId: 'dog-2',
          totalFee: 30,
          enrollmentTotalAmount: 3000,
          enrollmentPaidAmount: 25,
          enrollmentRefundAmount: 25,
        }),
      ],
      30,
    ],
  ];

  it.each(cases)('%s', (_label, entries, expected) => {
    const [group] = groupEntriesByEnrollment(entries);
    const footerDue = Math.max(0, enrollmentRemainingDollars(group!));
    expect(footerDue).toBe(expected);
    expect(owedFor(entries, 'owner-1')?.amount ?? 0).toBe(footerDue);
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

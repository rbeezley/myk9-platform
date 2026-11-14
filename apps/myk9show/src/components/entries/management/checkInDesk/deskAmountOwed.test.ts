import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { groupEntriesByEnrollment } from '@/utils/enrollmentGrouping';
import { enrollmentRemainingDollars } from '../enrollmentPayment';
import { AMOUNT_NOT_AVAILABLE, deskOwedForms, deskOwedHref, deskOwedLines } from './deskAmountOwed';

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

/** Dollars every owing form on the desk shows as due, each form once. */
const totalOwed = (entries: EntryManagementEntry[]) =>
  deskOwedForms(entries).reduce((sum, form) => sum + form.amount, 0);

const labelsOn = (entries: EntryManagementEntry[], cardId: string) =>
  deskOwedLines(deskOwedForms(entries), cardId).map(line => line.label);

const loaded = { enrollmentTotalAmount: 2500, enrollmentPaidAmount: 0 };

describe('deskOwedForms', () => {
  it('lists nothing for a paid form', () => {
    const paid = entry({
      paymentStatus: PaymentStatus.PAID_BY_CASH,
      paidAmount: 25,
      enrollmentTotalAmount: 2500,
      enrollmentPaidAmount: 25,
    });
    expect(deskOwedForms([paid])).toEqual([]);
  });

  it("names the form's payer and the cards that hold its dogs", () => {
    const client = entry({
      ...loaded,
      registrationId: 'reg-a',
      enrollmentPayerId: 'client-a',
      ownerId: 'client-a',
      ownerName: 'Pat Smith',
      handlerId: 'pro',
    });
    expect(deskOwedForms([client])).toEqual([
      {
        formKey: 'reg-a',
        payerId: 'client-a',
        payerName: 'Pat Smith',
        amount: 25,
        unknown: false,
        cardIds: ['pro'],
      },
    ]);
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
    const forms = deskOwedForms([slice('a', 'h1'), slice('b', 'h2')]);
    expect(forms).toHaveLength(1);
    expect(forms[0]).toMatchObject({ amount: 50, cardIds: ['h1', 'h2'] });
  });

  it('quotes the form balance when part has been received', () => {
    const partPaid = (id: string) =>
      entry({ id, dogId: id, enrollmentTotalAmount: 5000, enrollmentPaidAmount: 30 });
    expect(totalOwed([partPaid('a'), partPaid('b')])).toBe(20);
  });

  it('counts a waitlisted entry with an accepted one, as the form does', () => {
    const waitlisted = online({ id: 'w', dogId: 'dog-2', entryStatus: EntryStatus.WAITLIST });
    expect(totalOwed([online(), waitlisted])).toBe(50);
  });

  it('shows the waitlisted fee when the accepted entry is paid', () => {
    const paid = online({ paymentStatus: PaymentStatus.PAID_BY_CASH, paidAmount: 25 });
    const waitlisted = online({ id: 'w', dogId: 'dog-2', entryStatus: EntryStatus.WAITLIST });
    expect(totalOwed([paid, waitlisted])).toBe(25);
  });

  it('says the amount is unknown when the money root could not be reached', () => {
    expect(deskOwedForms([entry({ moneyRootUnresolved: true })])[0]?.unknown).toBe(true);
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

    it('never quotes a figure for a part-paid form, and names no payer', () => {
      const forms = deskOwedForms([
        notLoaded({ id: 'a', dogId: 'a', paidAmount: 0 }),
        notLoaded({ id: 'b', dogId: 'b', paidAmount: 0 }),
      ]);
      expect(forms).toEqual([
        {
          formKey: 'reg-1',
          payerId: null,
          payerName: null,
          amount: 0,
          unknown: true,
          cardIds: ['pro'],
        },
      ]);
      expect(labelsOn([notLoaded()], 'pro')).toEqual([AMOUNT_NOT_AVAILABLE]);
    });

    it('says so on a form whose entries look paid, since held money cannot be traced', () => {
      const paid = notLoaded({ paymentStatus: PaymentStatus.PAID_BY_CASH, paidAmount: 25 });
      expect(deskOwedForms([paid])[0]?.unknown).toBe(true);
    });

    it('names a known payer whose totals did not load', () => {
      const known = notLoaded({ enrollmentPayerId: 'owner-1' });
      expect(labelsOn([known], 'pro')).toEqual(['Alice Martin: amount not available']);
    });
  });

  describe('when a move-up root is not in the read', () => {
    const traced = { enrollmentPayerId: 'owner-1', enrollmentTotalAmount: 2500 };

    it('says unknown for a destination whose root is missing', () => {
      const destination = entry({ ...traced, id: 'dest', movedFromEntryId: 'gone' });
      expect(deskOwedForms([destination])).toEqual([
        expect.objectContaining({ formKey: 'reg-1', amount: 0, unknown: true }),
      ]);
    });

    it('says unknown for a moved row nobody claims', () => {
      const orphan = entry({
        ...traced,
        enrollmentPaidAmount: 25,
        id: 'moved',
        registrationId: 'reg-2',
        entryStatus: EntryStatus.MOVED,
      });
      const paidForm = entry({ ...traced, enrollmentPaidAmount: 25, id: 'paid', dogId: 'dog-2' });
      expect(deskOwedForms([paidForm, orphan])).toEqual([
        expect.objectContaining({ formKey: 'reg-2', amount: 0, unknown: true }),
      ]);
    });
  });
});

describe('deskOwedLines (owner decision 2026-11-14)', () => {
  const forPro = (id: string, payer: string, name: string) =>
    entry({
      ...loaded,
      id,
      dogId: id,
      registrationId: `reg-${id}`,
      enrollmentPayerId: payer,
      ownerId: payer,
      ownerName: name,
      handlerId: 'pro',
      handlerName: 'Pat Pro',
    });

  it('reads "Owes" when the payer is the handler', () => {
    const own = entry({ ...loaded, ownerId: 'alice', handlerId: 'alice' });
    expect(labelsOn([own], 'alice')).toEqual(['Owes $25.00']);
  });

  it("names the payer on a pro handler's card", () => {
    expect(labelsOn([forPro('a', 'client-a', 'Pat Smith')], 'pro')).toEqual([
      'Pat Smith owes $25.00',
    ]);
  });

  it('shows each payer of two forms on one card, never one merged figure', () => {
    const forms = [forPro('a', 'client-a', 'Pat Smith'), forPro('b', 'client-b', 'Bo Lee')];
    expect(deskOwedLines(deskOwedForms(forms), 'pro')).toEqual([
      { formKey: 'reg-a', label: 'Pat Smith owes $25.00' },
      { formKey: 'reg-b', label: 'Bo Lee owes $25.00' },
    ]);
  });

  it('counts one form once on a card holding two of its dogs', () => {
    const dog = (id: string) => ({
      ...forPro(id, 'client-a', 'Pat Smith'),
      registrationId: 'reg',
      enrollmentTotalAmount: 5000,
    });
    expect(labelsOn([dog('a'), dog('b')], 'pro')).toEqual(['Pat Smith owes $50.00']);
  });

  it('shows nothing for a paid form', () => {
    const paid = { ...forPro('a', 'client-a', 'Pat Smith'), enrollmentPaidAmount: 25 };
    expect(labelsOn([paid], 'pro')).toEqual([]);
  });

  it('shows nothing on a card holding none of the form', () => {
    expect(labelsOn([forPro('a', 'client-a', 'Pat Smith')], 'client-a')).toEqual([]);
  });

  it('says "Entry form owes" when no entry names the payer', () => {
    const unnamed = { ...forPro('a', 'stranger', 'Pat Smith'), ownerId: 'client-a' };
    expect(labelsOn([unnamed], 'pro')).toEqual(['Entry form owes $25.00']);
  });
});

/**
 * The desk's figure is the entry form footer's (`$X due` when `enrollmentRemainingDollars` is
 * above zero, else "Paid in full") in every case MYK9-1961 covers (MYK9-1937 owner decision,
 * 2026-11-13).
 */
describe('deskOwedForms matches the entry form footer (MYK9-1961 cases)', () => {
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
    expect(totalOwed(entries)).toBe(footerDue);
  });
});

describe('deskOwedHref', () => {
  it('opens the entry form by its key, never a search by name', () => {
    expect(deskOwedHref('show-1', 'reg-1')).toBe('/shows/show-1/entries?registration=reg-1');
    expect(deskOwedHref('show-1', 'pi:pi_1')).toBe('/shows/show-1/entries?registration=pi%3Api_1');
  });
});

import { describe, expect, it } from 'vitest';
import { PaymentStatus } from '@/types/show-registration-types';
import { orderThatPaidFor, paidAsFromRow, pullOutMoneyLines } from './pullOutMoney';

describe('pullOutMoneyLines', () => {
  it('names the entry fee and the service fee she paid, from the recorded amounts', () => {
    expect(
      pullOutMoneyLines({
        paidAs: 'online',
        entryFee: 30,
        order: { entryIds: ['e1'], platformFeeCents: 210 },
      })
    ).toEqual([
      'Entry fee $30.00: the secretary decides on a refund.',
      'Service fee $2.10: not refunded.',
    ]);
  });

  it('names no service fee figure on an order that paid for several entries', () => {
    expect(
      pullOutMoneyLines({
        paidAs: 'online',
        entryFee: 30,
        order: { entryIds: ['e1', 'e2'], platformFeeCents: 420 },
      })
    ).toEqual([
      'Entry fee $30.00: the secretary decides on a refund.',
      'Service fee: not refunded.',
    ]);
  });

  it('shows no service fee line for a check or cash entry, even if an order is passed', () => {
    for (const paidAs of ['check', 'cash'] as const) {
      expect(
        pullOutMoneyLines({
          paidAs,
          entryFee: 25,
          order: { entryIds: ['e1'], platformFeeCents: 175 },
        })
      ).toEqual(['Entry fee $25.00: the secretary decides on a refund.']);
    }
  });

  it('says only the entry fee while the order is still loading or records no fee', () => {
    const only = ['Entry fee $30.00: the secretary decides on a refund.'];
    expect(pullOutMoneyLines({ paidAs: 'online', entryFee: 30, order: null })).toEqual(only);
    expect(
      pullOutMoneyLines({
        paidAs: 'online',
        entryFee: 30,
        order: { entryIds: ['e1'], platformFeeCents: 0 },
      })
    ).toEqual(only);
  });

  it('shows the entry fee for an entry paid another way, with a service fee only from a card charge', () => {
    const fee = 'Entry fee $30.00: the secretary decides on a refund.';
    expect(pullOutMoneyLines({ paidAs: 'other', entryFee: 30, order: null })).toEqual([fee]);
    expect(
      pullOutMoneyLines({
        paidAs: 'other',
        entryFee: 30,
        order: { entryIds: ['e1'], platformFeeCents: 0 },
      })
    ).toEqual([fee]);
    expect(
      pullOutMoneyLines({
        paidAs: 'other',
        entryFee: 30,
        order: { entryIds: ['e1'], platformFeeCents: 210 },
      })
    ).toEqual([fee, 'Service fee $2.10: not refunded.']);
  });

  it('says nothing about money for an entry that has not been paid', () => {
    expect(pullOutMoneyLines({ paidAs: null, entryFee: 30, order: null })).toEqual([]);
    expect(pullOutMoneyLines({ paidAs: 'online', entryFee: 0, order: null })).toEqual([]);
  });

  it('promises no refund amount', () => {
    const text = pullOutMoneyLines({
      paidAs: 'online',
      entryFee: 30,
      order: { entryIds: ['e1'], platformFeeCents: 210 },
    }).join(' ');
    expect(text).not.toMatch(/refund(ed)? \$|will be refunded/i);
  });
});

describe('paidAsFromRow', () => {
  it('reads how the row’s own money arrived from its recorded method', () => {
    const paid = PaymentStatus.PAID_ONLINE;
    expect(paidAsFromRow({ paymentStatus: paid, paymentMethod: 'online' })).toBe('online');
    expect(paidAsFromRow({ paymentStatus: paid, paymentMethod: 'check' })).toBe('check');
    expect(paidAsFromRow({ paymentStatus: paid, paymentMethod: 'cash' })).toBe('cash');
  });

  it('calls a generic database paid a check when the row records a check', () => {
    // The database's `paid` maps to PAID_ONLINE whatever the method; the method decides.
    expect(
      paidAsFromRow({ paymentStatus: PaymentStatus.PAID_ONLINE, paymentMethod: 'check' })
    ).toBe('check');
  });

  it('calls a confirmed payment with no card, check or cash method "other", never unpaid', () => {
    // A paid group_payment, credit, or an unrecorded method: she paid, so the entry fee still shows.
    for (const paymentMethod of ['group_payment', 'credit', '', null, undefined]) {
      expect(paidAsFromRow({ paymentStatus: PaymentStatus.PAID_ONLINE, paymentMethod })).toBe(
        'other'
      );
    }
  });

  it('says nothing when the reconciled status is not paid, whatever the method', () => {
    for (const paymentStatus of [
      PaymentStatus.PENDING,
      PaymentStatus.REFUNDED,
      PaymentStatus.WAIVED,
      undefined,
    ]) {
      expect(paidAsFromRow({ paymentStatus, paymentMethod: 'online' })).toBeNull();
    }
  });
});

describe('orderThatPaidFor', () => {
  const order = (id: string, status: string, entryIds: string[]) => ({ id, status, entryIds });

  it('picks the settled charge, not an earlier attempt that covers the same entry', () => {
    const orders = [order('retry', 'pending', ['e1']), order('paid', 'succeeded', ['e1', 'e2'])];
    expect(orderThatPaidFor('e1', orders)?.id).toBe('paid');
  });

  it('is null when more than one settled charge covers the entry (ambiguous)', () => {
    const orders = [order('a', 'succeeded', ['e1']), order('b', 'succeeded', ['e1'])];
    expect(orderThatPaidFor('e1', orders)).toBeNull();
  });

  it('is null when nothing settled or the orders have not loaded', () => {
    expect(orderThatPaidFor('e1', [order('a', 'pending', ['e1'])])).toBeNull();
    expect(orderThatPaidFor('e1', [order('a', 'succeeded', ['e2'])])).toBeNull();
    expect(orderThatPaidFor('e1', undefined)).toBeNull();
  });
});

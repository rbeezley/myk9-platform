import { describe, expect, it } from 'vitest';
import { PaymentStatus } from '@/types/show-registration-types';
import { paidAsFromStatus, pullOutMoneyLines } from './pullOutMoney';

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

describe('paidAsFromStatus', () => {
  it('reads how the row’s own money arrived', () => {
    expect(paidAsFromStatus(PaymentStatus.PAID_ONLINE)).toBe('online');
    expect(paidAsFromStatus(PaymentStatus.PAID_BY_CHECK)).toBe('check');
    expect(paidAsFromStatus(PaymentStatus.PAID_BY_CASH)).toBe('cash');
    expect(paidAsFromStatus(PaymentStatus.PENDING)).toBeNull();
    expect(paidAsFromStatus(PaymentStatus.REFUNDED)).toBeNull();
    expect(paidAsFromStatus(undefined)).toBeNull();
  });
});

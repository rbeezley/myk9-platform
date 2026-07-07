import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import {
  buildEntryBalanceRecoveryHref,
  summarizeEntryBalances,
  type EntryBalanceSource,
} from './entryBalanceSummary';

function entry(overrides: Partial<EntryBalanceSource>): EntryBalanceSource {
  return {
    id: 'entry-1',
    showId: 'show-1',
    showName: 'Spring Trial',
    showDate: new Date(2026, 5, 10),
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    paymentMethod: 'online',
    totalFee: 25,
    ...overrides,
  };
}

const now = new Date(2026, 5, 1);

describe('summarizeEntryBalances', () => {
  it('sums current accepted and pending-review fees into the same amount due My Shows displays', () => {
    const summary = summarizeEntryBalances(
      [
        entry({ id: 'accepted-online', totalFee: 25 }),
        entry({
          id: 'pending-online',
          entryStatus: EntryStatus.PENDING,
          totalFee: 30,
        }),
        entry({
          id: 'paid-online',
          paymentStatus: PaymentStatus.PAID_ONLINE,
          totalFee: 10,
        }),
        entry({
          id: 'waitlist',
          entryStatus: EntryStatus.WAITLIST,
          totalFee: 40,
        }),
        entry({
          id: 'past-unpaid',
          showDate: new Date(2026, 4, 1),
          showEndDate: new Date(2026, 4, 2),
          totalFee: 50,
        }),
      ],
      now
    );

    expect(summary.currentFeesCents).toBe(6500);
    expect(summary.amountDueCents).toBe(5500);
    expect(summary.onlineDueCents).toBe(5500);
  });

  it('keeps pay-at-show balances in amount due without adding them to cart checkout links', () => {
    const summary = summarizeEntryBalances(
      [
        entry({ id: 'online', paymentMethod: 'online', totalFee: 25 }),
        entry({ id: 'cash', paymentMethod: 'cash', totalFee: 30 }),
      ],
      now
    );

    expect(summary.amountDueCents).toBe(5500);
    expect(summary.onlineDueCents).toBe(2500);
    expect(summary.payAtShowDueCents).toBe(3000);
    expect(summary.onlineShowBalances).toHaveLength(1);
    expect(summary.onlineShowBalances[0].entryIds).toEqual(['online']);
  });

  it('routes mixed online and pay-at-show balances to My Payments instead of a partial cart', () => {
    const summary = summarizeEntryBalances(
      [
        entry({ id: 'online', paymentMethod: 'online', totalFee: 25 }),
        entry({ id: 'cash', paymentMethod: 'cash', totalFee: 30 }),
      ],
      now
    );

    expect(buildEntryBalanceRecoveryHref(summary)).toBe('/exhibitor/payments?due=1');
  });

  it('builds an exact cart recovery link for one online show', () => {
    const summary = summarizeEntryBalances(
      [
        entry({
          id: 'grouped',
          classes: [{ id: 'entry-a' }, { id: 'entry-b' }],
        }),
      ],
      now
    );

    expect(buildEntryBalanceRecoveryHref(summary)).toBe(
      '/cart?showId=show-1&entryIds=entry-a%2Centry-b'
    );
  });

  it('sends multi-show balances to My Payments instead of choosing the wrong cart', () => {
    const summary = summarizeEntryBalances(
      [
        entry({ id: 'entry-a', showId: 'show-1', showName: 'A Trial' }),
        entry({ id: 'entry-b', showId: 'show-2', showName: 'B Trial' }),
      ],
      now
    );

    expect(buildEntryBalanceRecoveryHref(summary)).toBe('/exhibitor/payments?due=1');
  });
});

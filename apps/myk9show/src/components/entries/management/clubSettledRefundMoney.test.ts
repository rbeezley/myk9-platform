import { describe, expect, it } from 'vitest';
import { netClubRefundedCents, remainingBalanceCents } from './clubSettledRefundMoney';

describe('netClubRefundedCents', () => {
  it('nets a payment and its reversal to zero', () => {
    expect(netClubRefundedCents([{ amount: 12.5 }, { amount: -12.5 }])).toBe(0);
  });

  it('adds payments that were not reversed', () => {
    expect(netClubRefundedCents([{ amount: 10 }, { amount: 5.25 }])).toBe(1525);
  });
});

describe('remainingBalanceCents', () => {
  it('floors at zero when the refunds exceed the fee', () => {
    expect(remainingBalanceCents(20, 0, 15, 1000)).toBe(0);
  });

  it('takes the card refund and the club refund off a $50 fee', () => {
    expect(remainingBalanceCents(50, 0, 15, 1000)).toBe(2500);
  });

  it('treats a missing card refund as none', () => {
    expect(remainingBalanceCents(50, null, null, 1000)).toBe(4000);
  });
});

describe('remainingBalanceCents with a discount', () => {
  it('takes the discount off a $50 fee before any refund', () => {
    expect(remainingBalanceCents(50, 10, null, 0)).toBe(4000);
  });
});

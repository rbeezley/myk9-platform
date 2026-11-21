import { describe, expect, it } from 'vitest';
import { isStripeRefundable, offersRefundDialog } from './refundEligibility';
import { PaymentStatus } from '@/types/show-registration-types';

type Case = {
  name: string;
  paymentMethod: string | null | undefined;
  paymentStatus: PaymentStatus;
  refundedAt: string | null | undefined;
  expected: boolean;
};

describe('isStripeRefundable', () => {
  const cases: Case[] = [
    {
      name: 'online + paid_online + no refund -> refundable',
      paymentMethod: 'online',
      paymentStatus: PaymentStatus.PAID_ONLINE,
      refundedAt: null,
      expected: true,
    },
    {
      name: 'online + paid_online + refundedAt undefined -> refundable',
      paymentMethod: 'online',
      paymentStatus: PaymentStatus.PAID_ONLINE,
      refundedAt: undefined,
      expected: true,
    },
    {
      name: 'online + paid_online + already refunded -> not refundable',
      paymentMethod: 'online',
      paymentStatus: PaymentStatus.PAID_ONLINE,
      refundedAt: '2026-01-01T00:00:00Z',
      expected: false,
    },
    {
      name: 'cash + paid_online (impossible combo) + no refund -> not refundable',
      paymentMethod: 'cash',
      paymentStatus: PaymentStatus.PAID_ONLINE,
      refundedAt: null,
      expected: false,
    },
    {
      name: 'check payment method -> not refundable',
      paymentMethod: 'check',
      paymentStatus: PaymentStatus.PAID_ONLINE,
      refundedAt: null,
      expected: false,
    },
    {
      name: 'online + pending -> not refundable',
      paymentMethod: 'online',
      paymentStatus: PaymentStatus.PENDING,
      refundedAt: null,
      expected: false,
    },
    {
      name: 'online + paid_by_cash -> not refundable',
      paymentMethod: 'online',
      paymentStatus: PaymentStatus.PAID_BY_CASH,
      refundedAt: null,
      expected: false,
    },
    {
      name: 'online + paid_by_check -> not refundable',
      paymentMethod: 'online',
      paymentStatus: PaymentStatus.PAID_BY_CHECK,
      refundedAt: null,
      expected: false,
    },
    {
      name: 'online + already REFUNDED status + no refundedAt -> refundable (status alone insufficient)',
      paymentMethod: 'online',
      paymentStatus: PaymentStatus.REFUNDED,
      refundedAt: null,
      expected: false,
    },
    {
      name: 'online + partial_refund + no refundedAt -> not refundable (wrong status)',
      paymentMethod: 'online',
      paymentStatus: PaymentStatus.PARTIAL_REFUND,
      refundedAt: null,
      expected: false,
    },
    {
      name: 'null payment method -> not refundable',
      paymentMethod: null,
      paymentStatus: PaymentStatus.PAID_ONLINE,
      refundedAt: null,
      expected: false,
    },
    {
      name: 'undefined payment method -> not refundable',
      paymentMethod: undefined,
      paymentStatus: PaymentStatus.PAID_ONLINE,
      refundedAt: null,
      expected: false,
    },
    {
      name: 'empty string refundedAt is truthy -> not refundable',
      paymentMethod: 'online',
      paymentStatus: PaymentStatus.PAID_ONLINE,
      refundedAt: '',
      expected: true,
    },
  ];

  it.each(cases)('$name', ({ paymentMethod, paymentStatus, refundedAt, expected }) => {
    const entry = {
      paymentMethod: paymentMethod as never,
      paymentStatus,
      refundedAt: refundedAt as never,
    };
    expect(isStripeRefundable(entry)).toBe(expected);
  });
});

describe('offersRefundDialog', () => {
  it('keeps an entry the club paid back reachable even after a card refund stamped it', () => {
    const entry = {
      paymentMethod: 'online',
      paymentStatus: PaymentStatus.PAID_ONLINE,
      refundedAt: '2026-11-01T00:00:00Z',
      clubRefundedAmount: 10,
      totalFee: 10,
    } as const;
    expect(offersRefundDialog(entry)).toBe(true);
    // The card-refund predicate is unchanged: no card refund is owed on this entry.
    expect(isStripeRefundable(entry)).toBe(false);
  });

  it('does not offer the dialog for a card-refunded entry with no club record', () => {
    expect(
      offersRefundDialog({
        paymentMethod: 'online',
        paymentStatus: PaymentStatus.PAID_ONLINE,
        refundedAt: '2026-11-01T00:00:00Z',
        clubRefundedAmount: 0,
        totalFee: 20,
        refundAmount: 20,
      })
    ).toBe(false);
  });

  it('offers the dialog after a partial card refund with no club record yet', () => {
    const entry = {
      paymentMethod: 'online',
      paymentStatus: PaymentStatus.PAID_ONLINE,
      refundedAt: '2026-11-01T00:00:00Z',
      totalFee: 50,
      refundAmount: 15,
    } as const;
    expect(offersRefundDialog(entry)).toBe(true);
    expect(isStripeRefundable(entry)).toBe(false);
  });

  it('does not offer the dialog once the discount, card refund and club payback cover the fee', () => {
    expect(
      offersRefundDialog({
        paymentMethod: 'online',
        paymentStatus: PaymentStatus.PAID_ONLINE,
        refundedAt: '2026-11-01T00:00:00Z',
        totalFee: 50,
        discountAmount: 10,
        refundAmount: 40,
      })
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { isPaymentRequestable } from './paymentRequestEligibility';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

type Case = {
  name: string;
  paymentStatus: PaymentStatus;
  comped: boolean | null | undefined;
  entryStatus: string;
  expected: boolean;
};

describe('isPaymentRequestable', () => {
  const cases: Case[] = [
    {
      name: 'pending + not comped + active status -> requestable',
      paymentStatus: PaymentStatus.PENDING,
      comped: false,
      entryStatus: EntryStatus.ACCEPTED,
      expected: true,
    },
    {
      name: 'pending + comped undefined + active status -> requestable',
      paymentStatus: PaymentStatus.PENDING,
      comped: undefined,
      entryStatus: EntryStatus.ACCEPTED,
      expected: true,
    },
    {
      name: 'pending + comped -> not requestable',
      paymentStatus: PaymentStatus.PENDING,
      comped: true,
      entryStatus: EntryStatus.ACCEPTED,
      expected: false,
    },
    {
      name: 'paid_online -> not requestable',
      paymentStatus: PaymentStatus.PAID_ONLINE,
      comped: false,
      entryStatus: EntryStatus.ACCEPTED,
      expected: false,
    },
    {
      name: 'paid_by_cash -> not requestable',
      paymentStatus: PaymentStatus.PAID_BY_CASH,
      comped: false,
      entryStatus: EntryStatus.ACCEPTED,
      expected: false,
    },
    {
      name: 'paid_by_check -> not requestable',
      paymentStatus: PaymentStatus.PAID_BY_CHECK,
      comped: false,
      entryStatus: EntryStatus.ACCEPTED,
      expected: false,
    },
    {
      name: 'refunded -> not requestable',
      paymentStatus: PaymentStatus.REFUNDED,
      comped: false,
      entryStatus: EntryStatus.ACCEPTED,
      expected: false,
    },
    {
      name: 'pending + cancelled entry -> not requestable (withdrawn)',
      paymentStatus: PaymentStatus.PENDING,
      comped: false,
      entryStatus: EntryStatus.CANCELLED,
      expected: false,
    },
    {
      name: 'pending + scratched entry -> not requestable',
      paymentStatus: PaymentStatus.PENDING,
      comped: false,
      entryStatus: EntryStatus.SCRATCHED,
      expected: false,
    },
    {
      name: 'pending + rejected entry -> not requestable',
      paymentStatus: PaymentStatus.PENDING,
      comped: false,
      entryStatus: EntryStatus.REJECTED,
      expected: false,
    },
    {
      name: 'pending + absent literal -> not requestable',
      paymentStatus: PaymentStatus.PENDING,
      comped: false,
      entryStatus: 'absent',
      expected: false,
    },
    {
      name: 'pending + promotion-expired literal -> not requestable',
      paymentStatus: PaymentStatus.PENDING,
      comped: false,
      entryStatus: 'promotion-expired',
      expected: false,
    },
    {
      name: 'pending + cancelled literal string -> not requestable',
      paymentStatus: PaymentStatus.PENDING,
      comped: false,
      entryStatus: 'cancelled',
      expected: false,
    },
    {
      name: 'pending + promoted waitlist (active) status -> requestable',
      paymentStatus: PaymentStatus.PENDING,
      comped: false,
      entryStatus: 'promoted',
      expected: true,
    },
    {
      name: 'pending + waitlisted status -> requestable (still active)',
      paymentStatus: PaymentStatus.PENDING,
      comped: false,
      entryStatus: 'waitlisted',
      expected: true,
    },
  ];

  it.each(cases)('$name', ({ paymentStatus, comped, entryStatus, expected }) => {
    const entry = {
      paymentStatus,
      comped: comped as never,
      entryStatus: entryStatus as never,
    };
    expect(isPaymentRequestable(entry)).toBe(expected);
  });
});

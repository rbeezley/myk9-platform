import { describe, expect, it } from 'vitest';
import { resolvePartialPayment, resolveRefund } from './enrollmentPayment';
import { PaymentStatus } from '@/types/show-registration-types';

describe('resolvePartialPayment', () => {
  type Case = {
    name: string;
    amountPaid: string;
    totalDollars: number;
    method: 'cash' | 'check';
    checkNumber: string;
    expected: ReturnType<typeof resolvePartialPayment>;
  };

  const cases: Case[] = [
    {
      name: 'zero amount -> null (not positive)',
      amountPaid: '0',
      totalDollars: 50,
      method: 'cash',
      checkNumber: '',
      expected: null,
    },
    {
      name: 'negative amount -> null',
      amountPaid: '-5',
      totalDollars: 50,
      method: 'cash',
      checkNumber: '',
      expected: null,
    },
    {
      name: 'non-numeric amount -> null',
      amountPaid: 'abc',
      totalDollars: 50,
      method: 'cash',
      checkNumber: '',
      expected: null,
    },
    {
      name: 'empty string amount -> null',
      amountPaid: '',
      totalDollars: 50,
      method: 'cash',
      checkNumber: '',
      expected: null,
    },
    {
      name: 'partial amount below total, cash -> PENDING, no reference',
      amountPaid: '20',
      totalDollars: 50,
      method: 'cash',
      checkNumber: '',
      expected: { status: PaymentStatus.PENDING, reference: null, amount: 20 },
    },
    {
      name: 'partial amount below total, check with number -> PENDING, reference still set (reference derives from method, not from paid-off status)',
      amountPaid: '20',
      totalDollars: 50,
      method: 'check',
      checkNumber: '1234',
      expected: { status: PaymentStatus.PENDING, reference: '1234', amount: 20 },
    },
    {
      name: 'amount equals total, cash -> PAID_BY_CASH',
      amountPaid: '50',
      totalDollars: 50,
      method: 'cash',
      checkNumber: '',
      expected: { status: PaymentStatus.PAID_BY_CASH, reference: null, amount: 50 },
    },
    {
      name: 'amount equals total, check with number -> PAID_BY_CHECK, reference set',
      amountPaid: '50',
      totalDollars: 50,
      method: 'check',
      checkNumber: '1234',
      expected: { status: PaymentStatus.PAID_BY_CHECK, reference: '1234', amount: 50 },
    },
    {
      name: 'amount equals total, check with empty checkNumber -> reference null',
      amountPaid: '50',
      totalDollars: 50,
      method: 'check',
      checkNumber: '',
      expected: { status: PaymentStatus.PAID_BY_CHECK, reference: null, amount: 50 },
    },
    {
      name: 'amount exceeds total, cash -> PAID_BY_CASH (overpayment allowed)',
      amountPaid: '75',
      totalDollars: 50,
      method: 'cash',
      checkNumber: '',
      expected: { status: PaymentStatus.PAID_BY_CASH, reference: null, amount: 75 },
    },
    {
      name: 'zero total, any positive amount -> immediately paid (cash)',
      amountPaid: '1',
      totalDollars: 0,
      method: 'cash',
      checkNumber: '',
      expected: { status: PaymentStatus.PAID_BY_CASH, reference: null, amount: 1 },
    },
  ];

  it.each(cases)('$name', ({ amountPaid, totalDollars, method, checkNumber, expected }) => {
    expect(resolvePartialPayment(amountPaid, totalDollars, method, checkNumber)).toEqual(expected);
  });
});

describe('resolveRefund', () => {
  type Case = {
    name: string;
    amountStr: string;
    paidDollars: number;
    isPartial: boolean;
    method: 'check_mailed' | 'cash_returned' | 'stripe' | 'other';
    notes: string;
    expected: ReturnType<typeof resolveRefund>;
  };

  const cases: Case[] = [
    {
      name: 'zero amount -> null',
      amountStr: '0',
      paidDollars: 50,
      isPartial: false,
      method: 'check_mailed',
      notes: '',
      expected: null,
    },
    {
      name: 'negative amount -> null',
      amountStr: '-10',
      paidDollars: 50,
      isPartial: false,
      method: 'check_mailed',
      notes: '',
      expected: null,
    },
    {
      name: 'non-numeric amount -> null',
      amountStr: 'nope',
      paidDollars: 50,
      isPartial: false,
      method: 'check_mailed',
      notes: '',
      expected: null,
    },
    {
      name: 'full refund (not partial), no notes -> REFUNDED, notes = method label only',
      amountStr: '50',
      paidDollars: 50,
      isPartial: false,
      method: 'check_mailed',
      notes: '',
      expected: { status: PaymentStatus.REFUNDED, amount: 50, notes: 'Check Mailed' },
    },
    {
      name: 'not partial, amount less than paid -> still REFUNDED (isPartial flag rules, not amount)',
      amountStr: '10',
      paidDollars: 50,
      isPartial: false,
      method: 'cash_returned',
      notes: '',
      expected: { status: PaymentStatus.REFUNDED, amount: 10, notes: 'Cash Returned' },
    },
    {
      name: 'partial flagged, amount equals paid -> REFUNDED (covers whole amount)',
      amountStr: '50',
      paidDollars: 50,
      isPartial: true,
      method: 'stripe',
      notes: '',
      expected: { status: PaymentStatus.REFUNDED, amount: 50, notes: 'Stripe (manual)' },
    },
    {
      name: 'partial flagged, amount exceeds paid -> REFUNDED',
      amountStr: '75',
      paidDollars: 50,
      isPartial: true,
      method: 'stripe',
      notes: '',
      expected: { status: PaymentStatus.REFUNDED, amount: 75, notes: 'Stripe (manual)' },
    },
    {
      name: 'partial flagged, amount below paid -> PARTIAL_REFUND',
      amountStr: '20',
      paidDollars: 50,
      isPartial: true,
      method: 'other',
      notes: '',
      expected: { status: PaymentStatus.PARTIAL_REFUND, amount: 20, notes: 'Other' },
    },
    {
      name: 'notes provided -> combined with method label',
      amountStr: '20',
      paidDollars: 50,
      isPartial: true,
      method: 'other',
      notes: 'customer requested',
      expected: {
        status: PaymentStatus.PARTIAL_REFUND,
        amount: 20,
        notes: 'Other: customer requested',
      },
    },
    {
      name: 'notes whitespace-only -> trimmed away, notes = method label only',
      amountStr: '20',
      paidDollars: 50,
      isPartial: true,
      method: 'other',
      notes: '   ',
      expected: { status: PaymentStatus.PARTIAL_REFUND, amount: 20, notes: 'Other' },
    },
    {
      name: 'unknown method falls back to raw method string as label',
      amountStr: '20',
      paidDollars: 50,
      isPartial: true,
      // Cast to force an out-of-union method through the fallback branch.
      method: 'unknown_method' as unknown as 'other',
      notes: '',
      expected: { status: PaymentStatus.PARTIAL_REFUND, amount: 20, notes: 'unknown_method' },
    },
  ];

  it.each(cases)('$name', ({ amountStr, paidDollars, isPartial, method, notes, expected }) => {
    expect(resolveRefund(amountStr, paidDollars, isPartial, method, notes)).toEqual(expected);
  });
});

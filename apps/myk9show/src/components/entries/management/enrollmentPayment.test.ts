import { describe, expect, it } from 'vitest';
import { resolvePartialPayment, resolveRefund } from './enrollmentPayment';

/**
 * MYK9-677: the payment forms resolve into payments-ledger actions. The server
 * (record_enrollment_payment) decides the enrollment's status and running paid
 * total, so these no longer compute a status.
 */
const DAY = '2026-09-17';

describe('resolvePartialPayment', () => {
  type Case = {
    name: string;
    amountPaid: string;
    method: 'cash' | 'check';
    checkNumber: string;
    receivedOn: string;
    expected: ReturnType<typeof resolvePartialPayment>;
  };

  const cases: Case[] = [
    {
      name: 'zero -> null',
      amountPaid: '0',
      method: 'cash',
      checkNumber: '',
      receivedOn: DAY,
      expected: null,
    },
    {
      name: 'negative -> null',
      amountPaid: '-5',
      method: 'cash',
      checkNumber: '',
      receivedOn: DAY,
      expected: null,
    },
    {
      name: 'non-numeric -> null',
      amountPaid: 'abc',
      method: 'cash',
      checkNumber: '',
      receivedOn: DAY,
      expected: null,
    },
    {
      name: 'empty -> null',
      amountPaid: '',
      method: 'cash',
      checkNumber: '',
      receivedOn: DAY,
      expected: null,
    },
    {
      name: 'no received date -> null',
      amountPaid: '20',
      method: 'cash',
      checkNumber: '',
      receivedOn: '',
      expected: null,
    },
    {
      name: 'cash: this payment, no reference',
      amountPaid: '20',
      method: 'cash',
      checkNumber: '9999',
      receivedOn: DAY,
      expected: { kind: 'payment', method: 'cash', amount: 20, receivedOn: DAY, reference: null },
    },
    {
      name: 'check with number: reference is the check number',
      amountPaid: '15',
      method: 'check',
      checkNumber: ' 1234 ',
      receivedOn: '2026-08-27',
      expected: {
        kind: 'payment',
        method: 'check',
        amount: 15,
        receivedOn: '2026-08-27',
        reference: '1234',
      },
    },
    {
      name: 'check with no number: null reference',
      amountPaid: '15',
      method: 'check',
      checkNumber: '',
      receivedOn: DAY,
      expected: { kind: 'payment', method: 'check', amount: 15, receivedOn: DAY, reference: null },
    },
    {
      name: 'rounds to cents',
      amountPaid: '10.005',
      method: 'cash',
      checkNumber: '',
      receivedOn: DAY,
      expected: {
        kind: 'payment',
        method: 'cash',
        amount: 10.01,
        receivedOn: DAY,
        reference: null,
      },
    },
  ];

  it.each(cases)('$name', ({ amountPaid, method, checkNumber, receivedOn, expected }) => {
    expect(resolvePartialPayment(amountPaid, method, checkNumber, receivedOn)).toEqual(expected);
  });
});

describe('resolveRefund', () => {
  type Case = {
    name: string;
    amountStr: string;
    paidDollars: number;
    method: 'check_mailed' | 'cash_returned' | 'stripe' | 'other';
    notes: string;
    expected: ReturnType<typeof resolveRefund>;
  };

  const cases: Case[] = [
    {
      name: 'zero -> null',
      amountStr: '0',
      paidDollars: 50,
      method: 'check_mailed',
      notes: '',
      expected: null,
    },
    {
      name: 'negative -> null',
      amountStr: '-10',
      paidDollars: 50,
      method: 'check_mailed',
      notes: '',
      expected: null,
    },
    {
      name: 'non-numeric -> null',
      amountStr: 'nope',
      paidDollars: 50,
      method: 'check_mailed',
      notes: '',
      expected: null,
    },
    {
      name: 'above paid -> null',
      amountStr: '75',
      paidDollars: 50,
      method: 'stripe',
      notes: '',
      expected: null,
    },
    {
      name: 'check mailed is a desk check refund',
      amountStr: '50',
      paidDollars: 50,
      method: 'check_mailed',
      notes: '',
      expected: {
        kind: 'refund',
        method: 'check',
        amount: 50,
        receivedOn: DAY,
        notes: 'Check Mailed',
      },
    },
    {
      name: 'cash returned is a desk cash refund',
      amountStr: '10',
      paidDollars: 50,
      method: 'cash_returned',
      notes: '',
      expected: {
        kind: 'refund',
        method: 'cash',
        amount: 10,
        receivedOn: DAY,
        notes: 'Cash Returned',
      },
    },
    {
      name: 'Stripe is not desk money: no ledger method',
      amountStr: '50',
      paidDollars: 50,
      method: 'stripe',
      notes: '',
      expected: {
        kind: 'refund',
        method: null,
        amount: 50,
        receivedOn: DAY,
        notes: 'Stripe (manual)',
      },
    },
    {
      name: 'other: no ledger method, trimmed notes after the label',
      amountStr: '20',
      paidDollars: 50,
      method: 'other',
      notes: '  customer requested ',
      expected: {
        kind: 'refund',
        method: null,
        amount: 20,
        receivedOn: DAY,
        notes: 'Other: customer requested',
      },
    },
  ];

  it.each(cases)('$name', ({ amountStr, paidDollars, method, notes, expected }) => {
    expect(resolveRefund(amountStr, paidDollars, method, notes, DAY)).toEqual(expected);
  });
});

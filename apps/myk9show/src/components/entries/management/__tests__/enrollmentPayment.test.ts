import { describe, it, expect } from 'vitest';
import { resolvePartialPayment, resolveRefund } from '../enrollmentPayment';
import { PaymentStatus } from '@/types/show-registration-types';

describe('resolvePartialPayment', () => {
  it('returns null for a non-numeric amount', () => {
    expect(resolvePartialPayment('', 50, 'cash', '')).toBeNull();
    expect(resolvePartialPayment('abc', 50, 'cash', '')).toBeNull();
  });

  it('returns null for zero or negative amounts', () => {
    expect(resolvePartialPayment('0', 50, 'cash', '')).toBeNull();
    expect(resolvePartialPayment('-5', 50, 'cash', '')).toBeNull();
  });

  it('leaves the enrollment PENDING when the amount is below the total', () => {
    const result = resolvePartialPayment('20', 50, 'cash', '');
    expect(result).toEqual({ status: PaymentStatus.PENDING, reference: null, amount: 20 });
  });

  it('marks PAID_BY_CASH when a cash amount covers the full balance', () => {
    const result = resolvePartialPayment('50', 50, 'cash', '');
    expect(result).toEqual({ status: PaymentStatus.PAID_BY_CASH, reference: null, amount: 50 });
  });

  it('marks PAID_BY_CHECK and keeps the check number as reference when paid by check in full', () => {
    const result = resolvePartialPayment('60', 50, 'check', '1234');
    expect(result).toEqual({
      status: PaymentStatus.PAID_BY_CHECK,
      reference: '1234',
      amount: 60,
    });
  });

  it('uses a null reference for a check payment with no check number', () => {
    const result = resolvePartialPayment('50', 50, 'check', '');
    expect(result).toEqual({ status: PaymentStatus.PAID_BY_CHECK, reference: null, amount: 50 });
  });

  it('never attaches a check number for a cash payment', () => {
    const result = resolvePartialPayment('50', 50, 'cash', '9999');
    expect(result?.reference).toBeNull();
  });
});

describe('resolveRefund', () => {
  it('returns null for a non-positive amount', () => {
    expect(resolveRefund('', 50, 'check_mailed', '')).toBeNull();
    expect(resolveRefund('0', 50, 'check_mailed', '')).toBeNull();
  });

  it('lands a full refund as REFUNDED with the method label as notes', () => {
    const result = resolveRefund('50', 50, 'check_mailed', '');
    expect(result).toEqual({
      status: PaymentStatus.REFUNDED,
      amount: 50,
      notes: 'Check Mailed',
    });
  });

  it('lands a partial refund below the paid amount as PARTIAL_REFUND', () => {
    const result = resolveRefund('20', 50, 'cash_returned', '');
    expect(result).toEqual({
      status: PaymentStatus.PARTIAL_REFUND,
      amount: 20,
      notes: 'Cash Returned',
    });
  });

  it('treats a "partial" refund covering the whole paid amount as REFUNDED', () => {
    const result = resolveRefund('50', 50, 'stripe', '');
    expect(result?.status).toBe(PaymentStatus.REFUNDED);
  });

  it('appends trimmed notes after the method label', () => {
    const result = resolveRefund('50', 50, 'other', '  mailed 5/1  ');
    expect(result?.notes).toBe('Other: mailed 5/1');
  });

  it('rejects a refund above the amount paid', () => {
    expect(resolveRefund('51', 50, 'stripe', '')).toBeNull();
  });
});

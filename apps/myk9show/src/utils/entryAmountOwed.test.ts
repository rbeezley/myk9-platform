import { describe, expect, it } from 'vitest';
import { PaymentStatus } from '@/types/show-registration-types';
import { entryAmountOwed, entryCountsTowardFormTotal, isFreeEntry } from './entryAmountOwed';

describe('entryAmountOwed (MYK9-1908)', () => {
  it('owes nothing on a Free entry, whatever the class fee is', () => {
    expect(
      entryAmountOwed({ totalFee: 35, paidAmount: 0, paymentStatus: PaymentStatus.WAIVED })
    ).toBe(0);
  });

  it('owes nothing on a comped entry, even before its status reads waived', () => {
    expect(
      entryAmountOwed({
        totalFee: 35,
        paidAmount: 0,
        paymentStatus: PaymentStatus.PENDING,
        comped: true,
      })
    ).toBe(0);
  });

  it('keeps a Free entry free when its form is pending for a sibling entry', () => {
    expect(
      entryAmountOwed({
        totalFee: 35,
        paidAmount: 0,
        paymentStatus: PaymentStatus.WAIVED,
        enrollmentPaymentStatus: PaymentStatus.PENDING,
      })
    ).toBe(0);
  });

  it('owes nothing on a paid entry', () => {
    expect(
      entryAmountOwed({ totalFee: 35, paidAmount: 35, paymentStatus: PaymentStatus.PAID_BY_CHECK })
    ).toBe(0);
  });

  it('owes the whole fee on an unpaid entry', () => {
    expect(
      entryAmountOwed({ totalFee: 35, paidAmount: 0, paymentStatus: PaymentStatus.PENDING })
    ).toBe(35);
  });

  it('owes the rest of the fee after a partial payment', () => {
    expect(
      entryAmountOwed({ totalFee: 35, paidAmount: 20, paymentStatus: PaymentStatus.PENDING })
    ).toBe(15);
  });

  it('takes a discount off what is owed', () => {
    expect(
      entryAmountOwed({
        totalFee: 35,
        paidAmount: 0,
        paymentStatus: PaymentStatus.PENDING,
        discountAmount: 10,
      })
    ).toBe(25);
  });

  it('owes nothing on a refunded or partly refunded entry: its money question is closed', () => {
    expect(
      entryAmountOwed({ totalFee: 35, paidAmount: 0, paymentStatus: PaymentStatus.REFUNDED })
    ).toBe(0);
    expect(
      entryAmountOwed({
        totalFee: 35,
        paidAmount: 20,
        paymentStatus: PaymentStatus.PARTIAL_REFUND,
      })
    ).toBe(0);
  });

  it('never goes below zero and does not drift on cents', () => {
    expect(
      entryAmountOwed({ totalFee: 20, paidAmount: 30, paymentStatus: PaymentStatus.PENDING })
    ).toBe(0);
    expect(
      entryAmountOwed({ totalFee: 0.3, paidAmount: 0.1, paymentStatus: PaymentStatus.PENDING })
    ).toBe(0.2);
  });
});

describe('isFreeEntry', () => {
  it('is true for a waived or comped entry and false otherwise', () => {
    expect(isFreeEntry({ paymentStatus: PaymentStatus.WAIVED })).toBe(true);
    expect(isFreeEntry({ paymentStatus: PaymentStatus.PENDING, comped: true })).toBe(true);
    expect(isFreeEntry({ paymentStatus: PaymentStatus.PENDING })).toBe(false);
    expect(isFreeEntry({ paymentStatus: PaymentStatus.PAID_ONLINE })).toBe(false);
    expect(isFreeEntry({ paymentStatus: undefined })).toBe(false);
  });
});

describe('entryCountsTowardFormTotal (MYK9-1961)', () => {
  it('counts an unpaid or paid entry', () => {
    expect(entryCountsTowardFormTotal({ paymentStatus: PaymentStatus.PENDING })).toBe(true);
    expect(entryCountsTowardFormTotal({ paymentStatus: PaymentStatus.PAID_BY_CASH })).toBe(true);
  });

  it('leaves out a Free entry: waived, or comped before its status reads waived', () => {
    expect(entryCountsTowardFormTotal({ paymentStatus: PaymentStatus.WAIVED })).toBe(false);
    expect(
      entryCountsTowardFormTotal({ paymentStatus: PaymentStatus.PENDING, comped: true })
    ).toBe(false);
  });

  it('leaves out an entry refunded at the desk or by Stripe', () => {
    expect(entryCountsTowardFormTotal({ paymentStatus: PaymentStatus.REFUNDED })).toBe(false);
    expect(entryCountsTowardFormTotal({ paymentStatus: PaymentStatus.PARTIAL_REFUND })).toBe(
      false
    );
    // The Stripe refund stamp alone, as the server reads it.
    expect(
      entryCountsTowardFormTotal({ paymentStatus: PaymentStatus.PAID_ONLINE, refundAmount: 10 })
    ).toBe(false);
  });
});

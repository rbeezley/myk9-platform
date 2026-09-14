import { describe, expect, it } from 'vitest';
import { PaymentStatus } from '@/types/show-registration-types';
import { resolveEffectivePaymentStatus } from './effectivePaymentStatus';
import { getEffectivePaymentStatus, getEntryPaidAmount } from './entryManagementUtils';

describe('resolveEffectivePaymentStatus (MYK9-495)', () => {
  it("does not let an order's paid mask an entry's pending", () => {
    expect(resolveEffectivePaymentStatus(PaymentStatus.PENDING, PaymentStatus.PAID_ONLINE)).toBe(
      PaymentStatus.PENDING
    );
    expect(resolveEffectivePaymentStatus(PaymentStatus.PENDING, PaymentStatus.PAID_BY_CHECK)).toBe(
      PaymentStatus.PENDING
    );
  });

  it("does not let an entry's paid mask its order's pending", () => {
    expect(resolveEffectivePaymentStatus(PaymentStatus.PAID_ONLINE, PaymentStatus.PENDING)).toBe(
      PaymentStatus.PENDING
    );
  });

  it('keeps the order-level payment METHOD when both agree the entry is paid', () => {
    expect(
      resolveEffectivePaymentStatus(PaymentStatus.PAID_ONLINE, PaymentStatus.PAID_BY_CHECK)
    ).toBe(PaymentStatus.PAID_BY_CHECK);
  });

  it('keeps a partial refund from collapsing into a full one', () => {
    // Entries persist only the coarse `refunded`; the enrollment carries the
    // partial-vs-full distinction.
    expect(
      resolveEffectivePaymentStatus(PaymentStatus.REFUNDED, PaymentStatus.PARTIAL_REFUND)
    ).toBe(PaymentStatus.PARTIAL_REFUND);
  });

  it('leaves every settled-vs-settled pair on the prior order-first precedence', () => {
    // Only the UNPAID contest changes. Once neither side says pending they
    // describe the same settled outcome and the order carries the finer value,
    // so these keep their pre-MYK9-495 answers.
    expect(resolveEffectivePaymentStatus(PaymentStatus.PAID_ONLINE, PaymentStatus.WAIVED)).toBe(
      PaymentStatus.WAIVED
    );
    expect(
      resolveEffectivePaymentStatus(PaymentStatus.PAID_ONLINE, PaymentStatus.PARTIAL_REFUND)
    ).toBe(PaymentStatus.PARTIAL_REFUND);
  });

  it('falls back to whichever side has a status at all', () => {
    expect(resolveEffectivePaymentStatus(null, PaymentStatus.PAID_ONLINE)).toBe(
      PaymentStatus.PAID_ONLINE
    );
    expect(resolveEffectivePaymentStatus(PaymentStatus.WAIVED, null)).toBe(PaymentStatus.WAIVED);
    expect(resolveEffectivePaymentStatus(null, null)).toBeNull();
  });
});

describe('getEffectivePaymentStatus (entry management / card badges)', () => {
  it('badges a pending entry under a paid order as pending, not paid', () => {
    expect(
      getEffectivePaymentStatus({
        paymentStatus: PaymentStatus.PENDING,
        enrollmentPaymentStatus: PaymentStatus.PAID_ONLINE,
      })
    ).toBe(PaymentStatus.PENDING);
  });

  it('reports no money collected for that entry', () => {
    expect(
      getEntryPaidAmount({
        paymentStatus: PaymentStatus.PENDING,
        enrollmentPaymentStatus: PaymentStatus.PAID_ONLINE,
        totalFee: 30,
        refundAmount: null,
      })
    ).toBe(0);
  });

  it('still credits a genuinely order-paid entry in full', () => {
    expect(
      getEntryPaidAmount({
        paymentStatus: PaymentStatus.PAID_ONLINE,
        enrollmentPaymentStatus: PaymentStatus.PAID_BY_CHECK,
        totalFee: 30,
        refundAmount: null,
      })
    ).toBe(30);
  });
});

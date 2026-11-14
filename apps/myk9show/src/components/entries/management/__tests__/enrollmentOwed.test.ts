import { describe, expect, it } from 'vitest';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { groupEntriesByEnrollment } from '@/utils/enrollmentGrouping';
import {
  enrollmentRemainingDollars,
  netReceivedDollars,
  paidInFullDollars,
} from '../enrollmentPayment';

/**
 * MYK9-1961: the entry form's "due" never shows a refunded or comped fee as owed,
 * with an enrollment row (the server's form total) or without one (summed here).
 */
const base: EntryManagementEntry = {
  id: '',
  registrationId: '',
  entryNumber: '',
  showId: 'show-1',
  dogId: 'dog-1',
  dogName: 'Bravo',
  ownerName: 'Test',
  ownerEmail: '',
  handlerName: 'Alice',
  classes: [],
  totalFee: 25,
  paidAmount: 0,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PENDING,
  rawPaymentStatus: 'pending',
  submittedAt: new Date(),
  lastUpdated: new Date(),
};

const only = (entries: EntryManagementEntry[]) => {
  const groups = groupEntriesByEnrollment(entries);
  expect(groups).toHaveLength(1);
  return groups[0]!;
};

describe('a form with no enrollment row (MYK9-1961)', () => {
  it('owes nothing for a comped entry, which is waived and keeps its fee', () => {
    const group = only([
      {
        ...base,
        id: 'comped',
        stripePaymentIntentId: 'pi_1',
        paymentStatus: PaymentStatus.WAIVED,
        rawPaymentStatus: 'waived',
        comped: true,
      },
    ]);

    expect(group.totalAmount).toBe(0);
    expect(enrollmentRemainingDollars(group)).toBe(0);
  });

  it('owes only the unpaid entry beside a comped one', () => {
    const group = only([
      {
        ...base,
        id: 'comped',
        stripePaymentIntentId: 'pi_1',
        paymentStatus: PaymentStatus.WAIVED,
        rawPaymentStatus: 'waived',
        comped: true,
      },
      { ...base, id: 'owing', stripePaymentIntentId: 'pi_1', totalFee: 30 },
    ]);

    expect(enrollmentRemainingDollars(group)).toBe(30);
  });

  it('owes nothing for a Stripe-refunded entry, and its sibling still owes in full', () => {
    // A partial Stripe refund: $10 of $25 went back, so the entry row reads $15 paid.
    // Counting that $15 as received would hide the sibling's debt.
    const group = only([
      {
        ...base,
        id: 'refunded',
        stripePaymentIntentId: 'pi_1',
        paymentStatus: PaymentStatus.REFUNDED,
        rawPaymentStatus: 'refunded',
        refundAmount: 10,
        paidAmount: 15,
      },
      { ...base, id: 'owing', stripePaymentIntentId: 'pi_1' },
    ]);

    expect(enrollmentRemainingDollars(group)).toBe(25);
  });
});

/**
 * With an enrollment row the total is the server's `enrollments.total_amount`
 * (`private.enrollment_owed_cents`, which leaves refunded and Free entries out from
 * migration 20261114013900). The figures below are what the server writes; its half
 * is proven by supabase/tests/myk9_1961_refunded_fee_not_owed_test.sql.
 */
const enrolled = (overrides: Partial<EntryManagementEntry>): EntryManagementEntry => ({
  ...base,
  registrationId: 'enr-1',
  enrollmentPaymentStatus: PaymentStatus.REFUNDED,
  ...overrides,
});

describe('a form with an enrollment row (MYK9-1961)', () => {
  it('reads nothing due after a full desk cash refund', () => {
    const group = only([
      enrolled({
        id: 'a',
        paymentStatus: PaymentStatus.REFUNDED,
        rawPaymentStatus: 'refunded',
        enrollmentTotalAmount: 0,
        enrollmentPaidAmount: 25,
        enrollmentRefundAmount: 25,
      }),
    ]);

    expect(enrollmentRemainingDollars(group)).toBe(0);
    expect(netReceivedDollars(group)).toBe(0);
    // A later "Paid in Full" reopens the refunded entry (MYK9-773) and charges its fee.
    expect(paidInFullDollars(group)).toBe(25);
  });

  it('reads nothing due after a partial desk refund of a paid form', () => {
    const entry = {
      paymentStatus: PaymentStatus.REFUNDED,
      rawPaymentStatus: 'refunded',
      enrollmentPaymentStatus: PaymentStatus.PARTIAL_REFUND,
      enrollmentTotalAmount: 0,
      enrollmentPaidAmount: 50,
      enrollmentRefundAmount: 10,
    };
    const group = only([enrolled({ ...entry, id: 'a' }), enrolled({ ...entry, id: 'b' })]);

    expect(enrollmentRemainingDollars(group)).toBeLessThanOrEqual(0);
    // The desk still holds $40 of it.
    expect(netReceivedDollars(group)).toBe(40);
    // Paid in Full reopens both entries ($50); the $40 held leaves $10.
    expect(paidInFullDollars(group)).toBe(10);
  });

  it('still owes the fee of an entry added after a refund', () => {
    const group = only([
      enrolled({
        id: 'refunded',
        paymentStatus: PaymentStatus.REFUNDED,
        rawPaymentStatus: 'refunded',
        enrollmentPaymentStatus: PaymentStatus.PENDING,
        enrollmentTotalAmount: 3000,
        enrollmentPaidAmount: 25,
        enrollmentRefundAmount: 25,
      }),
      enrolled({
        id: 'added',
        totalFee: 30,
        enrollmentPaymentStatus: PaymentStatus.PENDING,
        enrollmentTotalAmount: 3000,
        enrollmentPaidAmount: 25,
        enrollmentRefundAmount: 25,
      }),
    ]);

    expect(enrollmentRemainingDollars(group)).toBe(30);
  });

  it('never reopens a Stripe-refunded, card-paid or comped entry on Paid in Full', () => {
    const shared = {
      enrollmentPaymentStatus: PaymentStatus.PAID_ONLINE,
      enrollmentTotalAmount: 0,
      enrollmentPaidAmount: 0,
    };
    const group = only([
      enrolled({
        ...shared,
        id: 'stripe-refunded',
        paymentStatus: PaymentStatus.REFUNDED,
        rawPaymentStatus: 'refunded',
        refundAmount: 25,
        refundedAt: '2026-11-01T00:00:00Z',
      }),
      enrolled({
        ...shared,
        id: 'comped',
        paymentStatus: PaymentStatus.WAIVED,
        rawPaymentStatus: 'waived',
        comped: true,
      }),
    ]);

    expect(enrollmentRemainingDollars(group)).toBe(0);
    expect(paidInFullDollars(group)).toBe(0);
  });
});

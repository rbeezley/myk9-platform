import { describe, it, expect } from 'vitest';
import { groupEntriesByEnrollment } from './enrollmentGrouping';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

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
  totalFee: 10,
  paidAmount: 10,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PAID_ONLINE,
  submittedAt: new Date(),
  lastUpdated: new Date(),
};

describe('groupEntriesByEnrollment', () => {
  it('groups entries sharing a registrationId into one group', () => {
    const entries: EntryManagementEntry[] = [
      { ...base, id: 'e1', registrationId: 'reg-1', dogId: 'dog-1', dogName: 'Bravo' },
      { ...base, id: 'e2', registrationId: 'reg-1', dogId: 'dog-1', dogName: 'Bravo' },
      { ...base, id: 'e3', registrationId: 'reg-1', dogId: 'dog-2', dogName: 'Charlie' },
    ];
    const groups = groupEntriesByEnrollment(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].enrollmentId).toBe('reg-1');
    expect(groups[0].entries).toHaveLength(3);
  });

  it('creates separate groups for different registrationIds', () => {
    const entries: EntryManagementEntry[] = [
      { ...base, id: 'e1', registrationId: 'reg-1' },
      { ...base, id: 'e2', registrationId: 'reg-2' },
    ];
    const groups = groupEntriesByEnrollment(entries);
    expect(groups).toHaveLength(2);
  });

  it('groups entries with no registrationId under a single unregistered group', () => {
    const entries: EntryManagementEntry[] = [
      { ...base, id: 'e1', registrationId: '' },
      { ...base, id: 'e2', registrationId: '' },
    ];
    const groups = groupEntriesByEnrollment(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].enrollmentId).toBeNull();
  });

  it('sums entry fees as groupTotal when enrollmentTotalAmount is absent (dollars)', () => {
    const entries: EntryManagementEntry[] = [
      { ...base, id: 'e1', registrationId: 'reg-1', totalFee: 15 },
      { ...base, id: 'e2', registrationId: 'reg-1', totalFee: 20 },
    ];
    const groups = groupEntriesByEnrollment(entries);
    expect(groups[0].totalAmount).toBe(35);
    expect(groups[0].totalAmountUnit).toBe('dollars');
  });

  it('uses enrollmentTotalAmount when present (cents from Stripe)', () => {
    const entries: EntryManagementEntry[] = [
      { ...base, id: 'e1', registrationId: 'reg-1', totalFee: 15, enrollmentTotalAmount: 5000 },
      { ...base, id: 'e2', registrationId: 'reg-1', totalFee: 20, enrollmentTotalAmount: 5000 },
    ];
    const groups = groupEntriesByEnrollment(entries);
    expect(groups[0].totalAmount).toBe(5000);
    expect(groups[0].totalAmountUnit).toBe('cents');
  });

  it('populates refund fields from the first entry in the group', () => {
    const entries: EntryManagementEntry[] = [
      {
        ...base,
        id: 'e1',
        registrationId: 'reg-1',
        enrollmentRefundAmount: 25.0,
        enrollmentRefundNotes: 'check_mailed: mailed 5/1',
        enrollmentRefundedAt: '2026-05-01T12:00:00Z',
      },
    ];
    const groups = groupEntriesByEnrollment(entries);
    expect(groups[0].refundAmount).toBe(25.0);
    expect(groups[0].refundNotes).toBe('check_mailed: mailed 5/1');
    expect(groups[0].refundedAt).toBe('2026-05-01T12:00:00Z');
  });

  it('defaults refund fields to null when not present', () => {
    const entries: EntryManagementEntry[] = [{ ...base, id: 'e1', registrationId: 'reg-1' }];
    const groups = groupEntriesByEnrollment(entries);
    expect(groups[0].refundAmount).toBeNull();
    expect(groups[0].refundNotes).toBeNull();
    expect(groups[0].refundedAt).toBeNull();
  });

  // Entry-level Stripe refunds (no enrollment record — the webhook checkout
  // path). One refunded entry of two must NOT mark the whole group Refunded.
  it('shows Partial Refund when only some entries in the group are refunded', () => {
    const entries: EntryManagementEntry[] = [
      {
        ...base,
        id: 'e1',
        registrationId: '',
        paymentStatus: PaymentStatus.REFUNDED,
        refundAmount: 30,
        refundedAt: '2026-06-10T16:05:08Z',
      },
      { ...base, id: 'e2', registrationId: '', paymentStatus: PaymentStatus.PAID_ONLINE },
    ];
    const groups = groupEntriesByEnrollment(entries);
    expect(groups[0].paymentStatus).toBe(PaymentStatus.PARTIAL_REFUND);
    expect(groups[0].refundAmount).toBe(30);
    expect(groups[0].refundedAt).toBe('2026-06-10T16:05:08Z');
  });

  it('shows Refunded when every entry in the group is refunded', () => {
    const entries: EntryManagementEntry[] = [
      {
        ...base,
        id: 'e1',
        registrationId: '',
        paymentStatus: PaymentStatus.REFUNDED,
        refundAmount: 30,
        refundedAt: '2026-06-10T16:05:08Z',
      },
      {
        ...base,
        id: 'e2',
        registrationId: '',
        paymentStatus: PaymentStatus.REFUNDED,
        refundAmount: 30,
        refundedAt: '2026-06-10T17:00:00Z',
      },
    ];
    const groups = groupEntriesByEnrollment(entries);
    expect(groups[0].paymentStatus).toBe(PaymentStatus.REFUNDED);
    expect(groups[0].refundAmount).toBe(60);
  });

  it('keeps enrollment-level refund amount when present (entry refunds do not override)', () => {
    const entries: EntryManagementEntry[] = [
      {
        ...base,
        id: 'e1',
        registrationId: 'reg-1',
        enrollmentPaymentStatus: PaymentStatus.PARTIAL_REFUND,
        enrollmentRefundAmount: 25.0,
        refundAmount: 30,
      },
    ];
    const groups = groupEntriesByEnrollment(entries);
    expect(groups[0].refundAmount).toBe(25.0);
    expect(groups[0].paymentStatus).toBe(PaymentStatus.PARTIAL_REFUND);
  });
});

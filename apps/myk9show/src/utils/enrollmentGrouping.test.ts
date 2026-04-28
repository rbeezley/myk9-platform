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
});

import { describe, expect, it } from 'vitest';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';
import {
  getEligibleForBulkAction,
  statusTargetForAction,
} from '../bulkActionEligibility';

const aClass: EntryClass = {
  id: 'c1',
  name: 'Interior Novice A',
  number: '1',
  fee: 25,
  status: 'entered',
};

function entry(
  id: string,
  entryStatus: EntryStatus,
  classes: EntryClass[] = [aClass]
): EntryManagementEntry {
  return {
    id,
    registrationId: `reg-${id}`,
    entryNumber: id,
    showId: 'show-1',
    dogId: `dog-${id}`,
    dogName: `Dog ${id}`,
    ownerName: 'Owner',
    ownerEmail: 'o@example.com',
    handlerName: 'Handler',
    classes,
    totalFee: 25,
    paidAmount: 0,
    entryStatus,
    // paymentStatus is unused by the helper; cast a representative value
    paymentStatus: 'pending' as EntryManagementEntry['paymentStatus'],
    submittedAt: new Date('2026-06-01'),
    lastUpdated: new Date('2026-06-01'),
  };
}

const mixed: EntryManagementEntry[] = [
  entry('pending', EntryStatus.PENDING),
  entry('accepted', EntryStatus.ACCEPTED),
  entry('waitlist', EntryStatus.WAITLIST),
  entry('rejected', EntryStatus.REJECTED),
  entry('completed', EntryStatus.COMPLETED),
  entry('scratched', EntryStatus.SCRATCHED),
  entry('moved', EntryStatus.MOVED),
  entry('withdrawn', EntryStatus.CANCELLED),
  entry('moveup', EntryStatus.MOVE_UP_REQUESTED),
];

const ids = (entries: EntryManagementEntry[]) => entries.map(e => e.id).sort();

describe('statusTargetForAction', () => {
  it('maps status actions to their target and check-in to null', () => {
    expect(statusTargetForAction('approve')).toBe(EntryStatus.ACCEPTED);
    expect(statusTargetForAction('waitlist')).toBe(EntryStatus.WAITLIST);
    expect(statusTargetForAction('reject')).toBe(EntryStatus.REJECTED);
    expect(statusTargetForAction('check-in')).toBeNull();
  });
});

describe('getEligibleForBulkAction', () => {
  it('approve excludes closed statuses and already-accepted entries', () => {
    expect(ids(getEligibleForBulkAction(mixed, 'approve'))).toEqual(
      ['pending', 'rejected', 'waitlist'].sort()
    );
  });

  it('waitlist excludes closed statuses and already-waitlisted entries', () => {
    expect(ids(getEligibleForBulkAction(mixed, 'waitlist'))).toEqual(
      ['accepted', 'pending', 'rejected'].sort()
    );
  });

  it('reject excludes closed statuses and already-rejected entries', () => {
    expect(ids(getEligibleForBulkAction(mixed, 'reject'))).toEqual(
      ['accepted', 'pending', 'waitlist'].sort()
    );
  });

  it('never includes completed or move-up-requested in any status change', () => {
    for (const action of ['approve', 'waitlist', 'reject'] as const) {
      const eligibleIds = ids(getEligibleForBulkAction(mixed, action));
      expect(eligibleIds).not.toContain('completed');
      expect(eligibleIds).not.toContain('moveup');
      expect(eligibleIds).not.toContain('scratched');
      expect(eligibleIds).not.toContain('moved');
      expect(eligibleIds).not.toContain('withdrawn');
    }
  });

  it('check-in only includes accepted entries that have at least one class', () => {
    const entries = [
      entry('accepted-with-class', EntryStatus.ACCEPTED, [aClass]),
      entry('accepted-no-class', EntryStatus.ACCEPTED, []),
      entry('pending-with-class', EntryStatus.PENDING, [aClass]),
    ];
    expect(ids(getEligibleForBulkAction(entries, 'check-in'))).toEqual(['accepted-with-class']);
  });

  it('returns an empty array when nothing is eligible', () => {
    const closedOnly = [entry('completed', EntryStatus.COMPLETED)];
    expect(getEligibleForBulkAction(closedOnly, 'approve')).toEqual([]);
  });
});

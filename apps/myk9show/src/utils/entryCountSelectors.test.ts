import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import {
  countRawEntryManagementPendingBucket,
  getEntryManagementCountSummary,
} from './entryCountSelectors';
import type { EntryManagementEntry } from '@/types/entry-management-types';

function entry(overrides: Partial<EntryManagementEntry>): EntryManagementEntry {
  return {
    id: 'entry',
    registrationId: 'reg',
    entryNumber: '101',
    showId: 'show',
    dogId: 'dog',
    dogName: 'Dog',
    ownerName: 'Owner',
    ownerEmail: 'owner@example.com',
    handlerName: 'Handler',
    classes: [],
    totalFee: 0,
    paidAmount: 0,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-07-01T00:00:00Z'),
    lastUpdated: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

describe('entry count selectors', () => {
  it('counts raw pending-bucket statuses the same way Entry Management maps them', () => {
    const rawEntries = [
      { entry_status: 'submitted' },
      { entry_status: 'paid' },
      { entry_status: 'promotion-expired' },
      { entry_status: null },
      { entry_status: '' },
      { entry_status: 'confirmed' },
      { entry_status: 'waitlisted' },
      { entry_status: 'withdrawn' },
    ];
    const managementEntries = rawEntries.map((raw, index) =>
      entry({
        id: `entry-${index}`,
        entryStatus:
          raw.entry_status === 'confirmed'
            ? EntryStatus.ACCEPTED
            : raw.entry_status === 'waitlisted'
              ? EntryStatus.WAITLIST
              : raw.entry_status === 'withdrawn'
                ? EntryStatus.CANCELLED
                : EntryStatus.PENDING,
      })
    );

    expect(countRawEntryManagementPendingBucket(rawEntries)).toBe(5);
    expect(getEntryManagementCountSummary(managementEntries).tabCounts.pending).toBe(5);
  });
});

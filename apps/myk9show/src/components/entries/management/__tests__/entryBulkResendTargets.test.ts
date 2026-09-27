import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { getUniqueResendTargets } from '../entryBulkResendTargets';

function makeEntry(id: string, registrationId: string): EntryManagementEntry {
  return {
    id,
    registrationId,
    entryNumber: id,
    showId: 'show-1',
    dogId: id,
    dogName: `Dog ${id}`,
    ownerName: 'Owner',
    ownerEmail: 'owner@example.com',
    handlerName: 'Handler',
    classes: [],
    totalFee: 0,
    paidAmount: 0,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-01'),
  };
}

describe('getUniqueResendTargets', () => {
  it('dedupes to one send per registration when several selected entries share it', () => {
    const entries = [
      makeEntry('e1', 'registration-1'),
      makeEntry('e2', 'registration-1'),
      makeEntry('e3', 'registration-2'),
    ];

    expect(getUniqueResendTargets(entries, () => false)).toEqual([
      'registration-1',
      'registration-2',
    ]);
  });

  it('skips a registration the disabled check reports true for', () => {
    const entries = [makeEntry('e1', 'registration-1'), makeEntry('e2', 'registration-2')];

    expect(
      getUniqueResendTargets(entries, registrationId => registrationId === 'registration-1')
    ).toEqual(['registration-2']);
  });

  it('is empty for no selection', () => {
    expect(getUniqueResendTargets([], () => false)).toEqual([]);
  });
});

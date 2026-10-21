import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { countListedForms, deriveDefaultQueues } from '../entryQueueDefault';
import { groupEntriesByShowRegistration } from '../showRegistrationProjection';

function entry(
  id: string,
  classId: string,
  overrides: Partial<EntryManagementEntry> = {}
): EntryManagementEntry {
  return {
    id,
    registrationId: id,
    entryNumber: id,
    showId: 'show-1',
    dogId: id,
    dogName: `Dog ${id}`,
    ownerName: `Owner ${id}`,
    ownerEmail: `${id}@example.com`,
    handlerName: 'Handler',
    classes: [{ id, classId, name: 'Novice', number: '1', fee: 25, status: 'entered' }],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date(2026, 6, 1, 9),
    lastUpdated: new Date(2026, 6, 1, 9),
    ...overrides,
  };
}

const settled = (id: string, classId: string) => entry(id, classId);
const pending = (id: string, classId: string) =>
  entry(id, classId, { entryStatus: EntryStatus.PENDING });

describe('deriveDefaultQueues', () => {
  it('opens on All when Needs review lists nothing and All lists forms', () => {
    expect(deriveDefaultQueues({ needsReview: 0, all: 14 })).toEqual(['all']);
  });

  it('opens on Needs review when anything needs review', () => {
    expect(deriveDefaultQueues({ needsReview: 1, all: 14 })).toEqual(['needs-review']);
  });

  it('keeps Needs review while nothing has loaded, and for a show with no forms', () => {
    expect(deriveDefaultQueues(null)).toEqual(['needs-review']);
    expect(deriveDefaultQueues({ needsReview: 0, all: 0 })).toEqual(['needs-review']);
  });
});

describe('countListedForms', () => {
  const groups = groupEntriesByShowRegistration([
    settled('a1', 'class-a'),
    settled('a2', 'class-a'),
    pending('b1', 'class-b'),
  ]);
  const noScope = { search: '', classIds: [], trialClassIds: undefined };

  it('counts the whole show when nothing narrows it', () => {
    expect(countListedForms(groups, noScope)).toEqual({ needsReview: 1, all: 3 });
  });

  it('lands a class with nothing to review on All even when another class has items', () => {
    const counts = countListedForms(groups, { ...noScope, classIds: ['class-a'] });
    expect(counts).toEqual({ needsReview: 0, all: 2 });
    expect(deriveDefaultQueues(counts)).toEqual(['all']);
  });

  it('scopes by the selected trial classes', () => {
    expect(countListedForms(groups, { ...noScope, trialClassIds: ['class-b'] })).toEqual({
      needsReview: 1,
      all: 1,
    });
  });

  it('judges a search on the forms the search lists, ignoring class scope as the table does', () => {
    const counts = countListedForms(groups, {
      search: 'Dog a1',
      classIds: ['class-b'],
      trialClassIds: undefined,
    });
    expect(counts).toEqual({ needsReview: 0, all: 1 });
  });

  it('a search with no match lists nothing, so the default stays Needs review', () => {
    const counts = countListedForms(groups, { ...noScope, search: 'zzz' });
    expect(counts).toEqual({ needsReview: 0, all: 0 });
    expect(deriveDefaultQueues(counts)).toEqual(['needs-review']);
  });
});

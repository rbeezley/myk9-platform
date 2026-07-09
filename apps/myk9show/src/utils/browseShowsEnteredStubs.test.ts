import { describe, it, expect } from 'vitest';
import { mergeAccountEnteredShowStubs } from './browseShowsUtils';
import type { SyncableShowEntry } from '@/store/entry-store-types';

const USER = 'person-1';

function realEntry(showId: string, handlerId: string): SyncableShowEntry {
  const nowIso = '2026-07-01T00:00:00.000Z';
  return {
    id: `real:${showId}`,
    showId,
    classId: 'class-1',
    dogId: 'dog-1',
    status: 'submitted',
    registrationData: {
      submittedAt: nowIso,
      handler: handlerId,
      handlerId,
      entryFee: 0,
      paymentStatus: 'pending',
    },
    statusHistory: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    _version: 1,
    _lastModified: new Date(nowIso),
    _lastModifiedBy: handlerId,
    _syncStatus: 'synced',
  };
}

describe('mergeAccountEnteredShowStubs', () => {
  it('returns the original array unchanged when there are no account ids', () => {
    const entries = [realEntry('show-a', USER)];
    expect(mergeAccountEnteredShowStubs(entries, [], USER)).toBe(entries);
  });

  it('returns the original array unchanged when userId is missing', () => {
    const entries = [realEntry('show-a', USER)];
    expect(mergeAccountEnteredShowStubs(entries, ['show-b'], undefined)).toBe(entries);
  });

  it('adds a stub for an entered show missing from the local store', () => {
    const entries = [realEntry('show-a', USER)];
    const merged = mergeAccountEnteredShowStubs(entries, ['show-a', 'show-b'], USER);
    const showIds = merged.map(e => e.showId).sort();
    expect(showIds).toEqual(['show-a', 'show-b']);
    const stub = merged.find(e => e.showId === 'show-b')!;
    // Stub is stamped with the caller's user id so membership filters match.
    expect(stub.registrationData.handlerId).toBe(USER);
    expect(stub.registrationData.handler).toBe(USER);
  });

  it('does not duplicate a show the user already has a real entry for', () => {
    const entries = [realEntry('show-a', USER)];
    const merged = mergeAccountEnteredShowStubs(entries, ['show-a'], USER);
    expect(merged).toBe(entries);
    expect(merged.filter(e => e.showId === 'show-a')).toHaveLength(1);
  });

  it('still adds a stub when the local entry for that show belongs to another user', () => {
    // A co-resident cache row for another handler must not suppress this user's count.
    const entries = [realEntry('show-a', 'other-person')];
    const merged = mergeAccountEnteredShowStubs(entries, ['show-a'], USER);
    expect(merged).toHaveLength(2);
    expect(merged.some(e => e.showId === 'show-a' && e.registrationData.handlerId === USER)).toBe(
      true
    );
  });
});

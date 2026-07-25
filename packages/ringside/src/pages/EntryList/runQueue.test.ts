/**
 * Tests for the shared run-queue primitive.
 *
 * These pin the ordering + exclusion rules that MYK9-77 (class-row next-up
 * preview), MYK9-79 (favorite-dog push proximity) and MYK9-83 (post-save
 * quick-advance chips) all depend on. The in-ring dog is excluded from the
 * pending queue by user decision 2026-06-11 — do not "fix" that back.
 */

import { describe, expect, it } from 'vitest';
import {
  compareByRunOrder,
  findInRingEntry,
  isInQueue,
  isInRingEntry,
  nextPendingCandidates,
  pendingByRunOrder,
  type RunQueueEntry,
} from './runQueue';

function entry(overrides: Partial<RunQueueEntry> & { id: string; armband: number }): RunQueueEntry {
  return { isScored: false, ...overrides };
}

describe('pendingByRunOrder', () => {
  it('excludes the in-ring dog from the waiting queue', () => {
    const entries = [
      entry({ id: 'e1', armband: 1, status: 'in-ring' }),
      entry({ id: 'e2', armband: 2 }),
      entry({ id: 'e3', armband: 3 }),
    ];
    expect(pendingByRunOrder(entries).map(e => e.id)).toEqual(['e2', 'e3']);
  });

  it('orders by exhibitorOrder with armband fallback', () => {
    const entries = [
      entry({ id: 'e1', armband: 9, exhibitorOrder: 1 }),
      entry({ id: 'e2', armband: 1, exhibitorOrder: 2 }),
      entry({ id: 'e3', armband: 5 }), // no exhibitorOrder → falls back to armband 5
    ];
    expect(pendingByRunOrder(entries).map(e => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('excludes scored and pulled entries', () => {
    const entries = [
      entry({ id: 'e1', armband: 1, isScored: true }),
      entry({ id: 'e2', armband: 2, status: 'pulled' }),
      entry({ id: 'e3', armband: 3 }),
    ];
    expect(pendingByRunOrder(entries).map(e => e.id)).toEqual(['e3']);
  });

  it('does not mutate the caller’s array', () => {
    const entries = [entry({ id: 'e1', armband: 3 }), entry({ id: 'e2', armband: 1 })];
    pendingByRunOrder(entries);
    expect(entries.map(e => e.id)).toEqual(['e1', 'e2']);
  });

  it('preserves the caller’s row type so extra display fields survive', () => {
    const rows = [
      { id: 'e1', armband: 1, isScored: false, breed: 'Golden Retriever', callName: 'Bella' },
    ];
    expect(pendingByRunOrder(rows)[0]?.breed).toBe('Golden Retriever');
  });
});

describe('nextPendingCandidates', () => {
  const entries = [
    entry({ id: 'e1', armband: 1, status: 'in-ring' }),
    entry({ id: 'e2', armband: 2 }),
    entry({ id: 'e3', armband: 3 }),
    entry({ id: 'e4', armband: 4 }),
    entry({ id: 'e5', armband: 5 }),
  ];

  it('returns the next N waiting dogs in run order', () => {
    expect(nextPendingCandidates(entries, 3).map(e => e.id)).toEqual(['e2', 'e3', 'e4']);
  });

  it('returns fewer when the class is nearly done', () => {
    const nearlyDone = [
      entry({ id: 'e1', armband: 1, isScored: true }),
      entry({ id: 'e2', armband: 2 }),
    ];
    expect(nextPendingCandidates(nearlyDone, 3).map(e => e.id)).toEqual(['e2']);
  });

  it('returns an empty array for a finished class or a non-positive limit', () => {
    expect(nextPendingCandidates([entry({ id: 'e1', armband: 1, isScored: true })], 3)).toEqual([]);
    expect(nextPendingCandidates(entries, 0)).toEqual([]);
    expect(nextPendingCandidates(entries, -1)).toEqual([]);
  });
});

describe('findInRingEntry', () => {
  it('finds the in-ring dog via status', () => {
    const entries = [entry({ id: 'e1', armband: 1 }), entry({ id: 'e2', armband: 2, status: 'in-ring' })];
    expect(findInRingEntry(entries)?.id).toBe('e2');
  });

  it('honors the deprecated inRing flag the data adapter still sets', () => {
    const entries = [entry({ id: 'e1', armband: 1, inRing: true })];
    expect(findInRingEntry(entries)?.id).toBe('e1');
    expect(isInRingEntry(entries[0]!)).toBe(true);
  });

  it('returns null when no dog is in the ring', () => {
    expect(findInRingEntry([entry({ id: 'e1', armband: 1 })])).toBeNull();
  });
});

describe('isInQueue / compareByRunOrder', () => {
  it('treats unscored, unpulled entries as still due to run', () => {
    expect(isInQueue(entry({ id: 'e1', armband: 1 }))).toBe(true);
    expect(isInQueue(entry({ id: 'e2', armband: 2, isScored: true }))).toBe(false);
    expect(isInQueue(entry({ id: 'e3', armband: 3, status: 'pulled' }))).toBe(false);
  });

  it('sorts by exhibitorOrder ahead of armband', () => {
    const a = entry({ id: 'a', armband: 50, exhibitorOrder: 1 });
    const b = entry({ id: 'b', armband: 2 });
    expect(compareByRunOrder(a, b)).toBeLessThan(0);
  });
});

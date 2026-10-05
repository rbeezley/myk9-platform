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
  formatPlaceInLine,
  formatRunQueueState,
  isInQueue,
  isInRingEntry,
  nextPendingCandidates,
  pendingByRunOrder,
  placeInLine,
  runQueueStateOf,
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
    const entries = [
      entry({ id: 'e1', armband: 1 }),
      entry({ id: 'e2', armband: 2, status: 'in-ring' }),
    ];
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

// MYK9-995: run order is not unique per class, so equal keys must break the
// same way on every device and on the server (get_my_entry_queue_places).
describe('compareByRunOrder ties', () => {
  it('breaks a run-order tie by armband, whatever order the rows arrive in', () => {
    const nine = entry({ id: 'x-nine', armband: 9, exhibitorOrder: 4 });
    const three = entry({ id: 'x-three', armband: 3, exhibitorOrder: 4 });
    expect(pendingByRunOrder([nine, three]).map(e => e.id)).toEqual(['x-three', 'x-nine']);
    expect(pendingByRunOrder([three, nine]).map(e => e.id)).toEqual(['x-three', 'x-nine']);
  });

  it('breaks a tie on run order AND armband by id', () => {
    const b = entry({ id: 'b', armband: 7, exhibitorOrder: 2 });
    const a = entry({ id: 'a', armband: 7, exhibitorOrder: 2 });
    expect(pendingByRunOrder([b, a]).map(e => e.id)).toEqual(['a', 'b']);
  });

  it('breaks an armband-fallback tie (one ordered, one not) by armband', () => {
    // Run order 5 and an unordered dog wearing armband 5 share key 5.
    const ordered = entry({ id: 'o', armband: 40, exhibitorOrder: 5 });
    const unordered = entry({ id: 'u', armband: 5 });
    expect(pendingByRunOrder([ordered, unordered]).map(e => e.id)).toEqual(['u', 'o']);
  });

  it('leaves untied ordering exactly as before', () => {
    const rows = [
      entry({ id: 'z', armband: 1, exhibitorOrder: 30 }),
      entry({ id: 'y', armband: 99, exhibitorOrder: 10 }),
      entry({ id: 'x', armband: 20 }),
    ];
    expect(pendingByRunOrder(rows).map(e => e.id)).toEqual(['y', 'x', 'z']);
  });
});

describe('place in line (MYK9-992)', () => {
  // Realistic post-reorder class: stored numbers start above 1 and have gaps.
  const klass = [
    entry({ id: 'done', armband: 1, exhibitorOrder: 2, isScored: true }),
    entry({ id: 'ring', armband: 2, exhibitorOrder: 7, status: 'in-ring' }),
    entry({ id: 'a', armband: 3, exhibitorOrder: 31 }),
    entry({ id: 'b', armband: 4, exhibitorOrder: 9 }),
    entry({ id: 'pulled', armband: 5, exhibitorOrder: 8, status: 'pulled' }),
    entry({ id: 'c', armband: 6, exhibitorOrder: 12 }),
  ];

  it('numbers waiting dogs 1..N regardless of the stored numbers', () => {
    expect(['b', 'c', 'a'].map(id => placeInLine(klass, id))).toEqual([1, 2, 3]);
  });

  it('reports no place for in-ring, finished, pulled and unknown dogs', () => {
    expect(['ring', 'done', 'pulled', 'nope'].map(id => placeInLine(klass, id))).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('reports the state of dogs that have no place', () => {
    expect(runQueueStateOf(klass, 'ring')).toEqual({ kind: 'in-ring' });
    expect(runQueueStateOf(klass, 'done')).toEqual({ kind: 'done' });
    expect(runQueueStateOf(klass, 'pulled')).toEqual({ kind: 'pulled' });
    expect(runQueueStateOf(klass, 'nope')).toBeNull();
  });

  it('reads a completed status as done even when no score was recorded', () => {
    const rows = [entry({ id: 'x', armband: 1, status: 'completed', isScored: false })];
    expect(runQueueStateOf(rows, 'x')).toEqual({ kind: 'done' });
  });

  it('keeps a pulled dog pulled even when it was already scored', () => {
    const rows = [entry({ id: 'x', armband: 1, isScored: true, status: 'pulled' })];
    expect(runQueueStateOf(rows, 'x')).toEqual({ kind: 'pulled' });
  });

  it('honours the deprecated inRing flag like the queue does', () => {
    const rows = [entry({ id: 'x', armband: 1, inRing: true }), entry({ id: 'y', armband: 2 })];
    expect(runQueueStateOf(rows, 'x')).toEqual({ kind: 'in-ring' });
    expect(placeInLine(rows, 'y')).toBe(1);
  });

  it('formats places and states', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(formatPlaceInLine)).toEqual([
      'Next up',
      '2nd up',
      '3rd up',
      '4th up',
      '11th up',
      '12th up',
      '13th up',
      '21st up',
      '22nd up',
      '23rd up',
      '101st up',
      '111th up',
    ]);
    expect(formatRunQueueState({ kind: 'waiting', place: 2 })).toBe('2nd up');
    expect(formatRunQueueState({ kind: 'waiting-unknown' })).toBe('Waiting');
    expect(formatRunQueueState({ kind: 'in-ring' })).toBe('In ring');
    expect(formatRunQueueState({ kind: 'done' })).toBe('Done');
    expect(formatRunQueueState({ kind: 'pulled' })).toBe('Pulled');
  });
});

describe('check-in completed without a score (MYK9-996)', () => {
  const rows = [
    entry({ id: 'ran', armband: 1, exhibitorOrder: 2, status: 'completed', isScored: false }),
    entry({ id: 'a', armband: 2, exhibitorOrder: 9 }),
    entry({ id: 'b', armband: 3, exhibitorOrder: 31 }),
  ];

  it('is out of the queue, so later dogs are not pushed back a place', () => {
    expect(isInQueue(rows[0])).toBe(false);
    expect(pendingByRunOrder(rows).map(e => e.id)).toEqual(['a', 'b']);
    expect(nextPendingCandidates(rows, 1).map(e => e.id)).toEqual(['a']);
    expect(['a', 'b'].map(id => placeInLine(rows, id))).toEqual([1, 2]);
  });

  it('agrees with the state helper: the same dog is done', () => {
    expect(runQueueStateOf(rows, 'ran')).toEqual({ kind: 'done' });
  });
});

describe('withdrawn state', () => {
  it('is its own state and label, never Pulled', () => {
    const rows = [entry({ id: 'w', armband: 1, status: 'withdrawn' })];
    expect(runQueueStateOf(rows, 'w')).toEqual({ kind: 'withdrawn' });
    expect(formatRunQueueState({ kind: 'withdrawn' })).toBe('Withdrawn');
    expect(formatRunQueueState({ kind: 'pulled' })).toBe('Pulled');
  });
});

describe('queue membership is an allowlist (MYK9-992 / MYK9-996)', () => {
  // Every status either adapter can hand the queue. A new status must be added
  // here AND to the allowlist or denied on purpose; an unlisted one is out.
  const STATUS_TABLE: Array<[string | undefined, boolean]> = [
    // [status, still to run (isInQueue)]
    [undefined, true],
    ['no-status', true],
    ['checked-in', true],
    ['at-gate', true],
    ['come-to-gate', true],
    ['conflict', true],
    ['in-ring', true], // in the queue's rows; pendingByRunOrder drops it separately
    ['competing', true], // legacy in-ring synonym, unchanged
    ['draft', true],
    ['submitted', true],
    ['paid', true],
    ['confirmed', true],
    ['scheduled', true],
    ['pending-payment', true],
    ['promotion-expired', true],
    ['move-up-requested', true],
    ['move_up_requested', true],
    ['pulled', false],
    ['completed', false],
    ['withdrawn', false],
    ['scratched', false],
    ['absent', false],
    ['moved', false],
    ['not_accepted', false],
    ['some-future-status', false],
  ];

  it.each(STATUS_TABLE)('status %s -> in queue: %s', (status, expected) => {
    expect(isInQueue(entry({ id: 'x', armband: 1, status }))).toBe(expected);
  });

  it('numbers only the waiting dogs 1..N in a mixed class', () => {
    const rows = [
      entry({ id: 'wd', armband: 1, exhibitorOrder: 2, status: 'withdrawn' }),
      entry({ id: 'pu', armband: 2, exhibitorOrder: 3, status: 'pulled' }),
      entry({ id: 'co', armband: 3, exhibitorOrder: 4, status: 'completed' }),
      entry({ id: 'ri', armband: 4, exhibitorOrder: 5, status: 'in-ring' }),
      entry({ id: 'sc', armband: 5, exhibitorOrder: 6, isScored: true }),
      entry({ id: 'w1', armband: 6, exhibitorOrder: 9 }),
      entry({ id: 'w2', armband: 7, exhibitorOrder: 31 }),
    ];
    expect(pendingByRunOrder(rows).map(e => e.id)).toEqual(['w1', 'w2']);
    expect(['w1', 'w2'].map(id => placeInLine(rows, id))).toEqual([1, 2]);
    expect(['wd', 'pu', 'co', 'ri', 'sc'].map(id => runQueueStateOf(rows, id)?.kind)).toEqual([
      'withdrawn',
      'pulled',
      'done',
      'in-ring',
      'done',
    ]);
  });

  it('puts a lone waiting dog first behind a withdrawn one', () => {
    const rows = [
      entry({ id: 'wd', armband: 1, exhibitorOrder: 2, status: 'withdrawn' }),
      entry({ id: 'w', armband: 2, exhibitorOrder: 3 }),
    ];
    expect(placeInLine(rows, 'w')).toBe(1);
  });
});

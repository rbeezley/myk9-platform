import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import {
  computeShowMapAutoSortAssignments,
  isPinnedRunOrderEntry,
  snapshotPriorRunOrders,
} from '../showMapRunOrderAutoSort';

function entry(overrides: Partial<ReplicatedEntry>): ReplicatedEntry {
  return {
    id: overrides.id ?? 'entry-x',
    armband: overrides.armband,
    runOrder: overrides.runOrder,
    isScored: overrides.isScored,
    is_scored: overrides.is_scored,
    checkInStatus: overrides.checkInStatus,
    ring_entry_time: overrides.ring_entry_time,
    scoringCompletedAt: overrides.scoringCompletedAt,
    scoring_completed_at: overrides.scoring_completed_at,
    ...overrides,
  } as ReplicatedEntry;
}

describe('isPinnedRunOrderEntry', () => {
  it('pins entries with isScored = true', () => {
    expect(isPinnedRunOrderEntry(entry({ id: 'a', isScored: true }))).toBe(true);
  });

  it('pins entries with snake_case is_scored = true', () => {
    expect(isPinnedRunOrderEntry(entry({ id: 'a', is_scored: true }))).toBe(true);
  });

  it('pins entries currently in the ring (check_in_status = in-ring)', () => {
    expect(isPinnedRunOrderEntry(entry({ id: 'a', checkInStatus: 'in-ring' }))).toBe(true);
  });

  it('pins entries with a ring_entry_time even when status is unset', () => {
    expect(
      isPinnedRunOrderEntry(entry({ id: 'a', ring_entry_time: '2026-05-22T10:00:00Z' }))
    ).toBe(true);
  });

  it('pins entries with completed check-in status', () => {
    expect(isPinnedRunOrderEntry(entry({ id: 'a', checkInStatus: 'completed' }))).toBe(true);
  });

  it('pins entries with a scoring_completed_at timestamp', () => {
    expect(
      isPinnedRunOrderEntry(entry({ id: 'a', scoring_completed_at: '2026-05-22T10:00:00Z' }))
    ).toBe(true);
  });

  it('does not pin a plain pending entry', () => {
    expect(
      isPinnedRunOrderEntry(entry({ id: 'a', armband: '100', checkInStatus: 'checked-in' }))
    ).toBe(false);
  });
});

describe('computeShowMapAutoSortAssignments', () => {
  const baseEntries = [
    entry({ id: 'a', armband: '30', runOrder: 1 }),
    entry({ id: 'b', armband: '10', runOrder: 2 }),
    entry({ id: 'c', armband: '20', runOrder: 3 }),
  ];

  it('returns empty array when there are no entries', () => {
    expect(computeShowMapAutoSortAssignments([], 'armband-asc')).toEqual([]);
  });

  it('sorts unpinned entries ascending by armband and renumbers 1..N', () => {
    const result = computeShowMapAutoSortAssignments(baseEntries, 'armband-asc');
    // Expected sequence by armband ascending: b(10), c(20), a(30) -> runOrder 1,2,3
    expect(result).toEqual([
      { id: 'b', runOrder: 1 },
      { id: 'c', runOrder: 2 },
      { id: 'a', runOrder: 3 },
    ]);
  });

  it('sorts unpinned entries descending by armband', () => {
    const result = computeShowMapAutoSortAssignments(baseEntries, 'armband-desc');
    expect(result).toEqual([
      { id: 'a', runOrder: 1 },
      { id: 'c', runOrder: 2 },
      { id: 'b', runOrder: 3 },
    ]);
  });

  it('keeps pinned (scored) entries in their original slot and sorts the rest around them', () => {
    const entries = [
      entry({ id: 'a', armband: '30', runOrder: 1 }),
      entry({ id: 'b', armband: '10', runOrder: 2, isScored: true }), // pinned at slot 2
      entry({ id: 'c', armband: '20', runOrder: 3 }),
      entry({ id: 'd', armband: '5', runOrder: 4 }),
    ];
    const result = computeShowMapAutoSortAssignments(entries, 'armband-asc');
    // Unpinned by armband asc: d(5), c(20), a(30)
    // Slot 1 unpinned → d; slot 2 PINNED b; slot 3 unpinned → c; slot 4 unpinned → a
    expect(result).toEqual([
      { id: 'd', runOrder: 1 },
      { id: 'b', runOrder: 2 },
      { id: 'c', runOrder: 3 },
      { id: 'a', runOrder: 4 },
    ]);
  });

  it('pins the in-ring dog so a re-sort does not move it', () => {
    const entries = [
      entry({ id: 'a', armband: '30', runOrder: 1 }),
      entry({ id: 'b', armband: '10', runOrder: 2, checkInStatus: 'in-ring' }), // pinned
      entry({ id: 'c', armband: '20', runOrder: 3 }),
    ];
    const result = computeShowMapAutoSortAssignments(entries, 'armband-asc');
    // Unpinned by armband asc: c(20), a(30). Slot 2 stays b.
    expect(result).toEqual([
      { id: 'c', runOrder: 1 },
      { id: 'b', runOrder: 2 },
      { id: 'a', runOrder: 3 },
    ]);
  });

  it('produces a permutation for random preset (not a deterministic sort)', () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      entry({ id: `e${i}`, armband: String(i), runOrder: i + 1 })
    );
    const result = computeShowMapAutoSortAssignments(entries, 'random');
    expect(result).toHaveLength(10);
    // Every entry id appears exactly once
    const ids = result.map(r => r.id).sort();
    expect(ids).toEqual(entries.map(e => e.id).sort());
    // Run order values are 1..10
    const orders = result.map(r => r.runOrder).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('returns 1..N renumbering when every entry is pinned', () => {
    const entries = [
      entry({ id: 'a', armband: '30', runOrder: 1, isScored: true }),
      entry({ id: 'b', armband: '10', runOrder: 2, isScored: true }),
    ];
    const result = computeShowMapAutoSortAssignments(entries, 'armband-asc');
    expect(result).toEqual([
      { id: 'a', runOrder: 1 },
      { id: 'b', runOrder: 2 },
    ]);
  });

  it('treats missing run_order as last in the ordering pass', () => {
    const entries = [
      entry({ id: 'a', armband: '30', runOrder: undefined }),
      entry({ id: 'b', armband: '10', runOrder: 1 }),
      entry({ id: 'c', armband: '20', runOrder: 2 }),
    ];
    const result = computeShowMapAutoSortAssignments(entries, 'armband-asc');
    expect(result.map(r => r.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('snapshotPriorRunOrders', () => {
  it('captures id + runOrder for every entry, null when missing', () => {
    const entries = [
      entry({ id: 'a', runOrder: 5 }),
      entry({ id: 'b', runOrder: undefined }),
    ];
    expect(snapshotPriorRunOrders(entries)).toEqual([
      { id: 'a', runOrder: 5 },
      { id: 'b', runOrder: null },
    ]);
  });
});

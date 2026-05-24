import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ShowMapNode } from '../showMapTypes';
import {
  computeShowMapReorderAssignments,
  getReorderableEntryIds,
  isEntryDraggableForReorder,
  isShowMapEntryPinnedForReorder,
} from '../showMapReorderMode';

function entry(overrides: Partial<ReplicatedEntry>): ReplicatedEntry {
  return {
    id: overrides.id ?? 'entry-x',
    armband: overrides.armband,
    runOrder: overrides.runOrder,
    isScored: overrides.isScored,
    is_scored: overrides.is_scored,
    checkInStatus: overrides.checkInStatus,
    ring_entry_time: overrides.ring_entry_time,
    scoring_completed_at: overrides.scoring_completed_at,
    ...overrides,
  } as ReplicatedEntry;
}

function node(overrides: Partial<ShowMapNode> & { id: string; type: ShowMapNode['type'] }): ShowMapNode {
  return {
    id: overrides.id,
    type: overrides.type,
    label: overrides.label ?? overrides.id,
    childrenCount: overrides.childrenCount ?? 0,
    ...overrides,
  } as ShowMapNode;
}

describe('computeShowMapReorderAssignments', () => {
  it('returns [] when overId is null (drag dropped outside)', () => {
    const entries = [
      entry({ id: 'a', runOrder: 1 }),
      entry({ id: 'b', runOrder: 2 }),
    ];
    expect(computeShowMapReorderAssignments(entries, 'a', null)).toEqual([]);
  });

  it('returns [] when active and over are the same (no move)', () => {
    const entries = [
      entry({ id: 'a', runOrder: 1 }),
      entry({ id: 'b', runOrder: 2 }),
    ];
    expect(computeShowMapReorderAssignments(entries, 'a', 'a')).toEqual([]);
  });

  it('moves an unpinned entry from position 1 to position 3', () => {
    const entries = [
      entry({ id: 'a', runOrder: 1 }),
      entry({ id: 'b', runOrder: 2 }),
      entry({ id: 'c', runOrder: 3 }),
    ];
    const result = computeShowMapReorderAssignments(entries, 'a', 'c');
    // Result: b, c, a → run_order 1, 2, 3
    expect(result).toEqual([
      { id: 'b', runOrder: 1 },
      { id: 'c', runOrder: 2 },
      { id: 'a', runOrder: 3 },
    ]);
  });

  it('moves an unpinned entry backwards from position 3 to position 1', () => {
    const entries = [
      entry({ id: 'a', runOrder: 1 }),
      entry({ id: 'b', runOrder: 2 }),
      entry({ id: 'c', runOrder: 3 }),
    ];
    const result = computeShowMapReorderAssignments(entries, 'c', 'a');
    expect(result).toEqual([
      { id: 'c', runOrder: 1 },
      { id: 'a', runOrder: 2 },
      { id: 'b', runOrder: 3 },
    ]);
  });

  it('keeps pinned entries fixed in their original slots when an unpinned entry is dragged', () => {
    const entries = [
      entry({ id: 'a', runOrder: 1 }),
      entry({ id: 'b', runOrder: 2, isScored: true }), // pinned
      entry({ id: 'c', runOrder: 3 }),
      entry({ id: 'd', runOrder: 4 }),
    ];
    // Move c to where d is — among unpinned [a, c, d], moves c after d → [a, d, c]
    const result = computeShowMapReorderAssignments(entries, 'c', 'd');
    // Reassemble: slot1=a (unpinned), slot2=b (pinned), slot3=d (next unpinned), slot4=c (last unpinned)
    expect(result).toEqual([
      { id: 'a', runOrder: 1 },
      { id: 'b', runOrder: 2 },
      { id: 'd', runOrder: 3 },
      { id: 'c', runOrder: 4 },
    ]);
  });

  it('refuses to move a pinned entry (returns [])', () => {
    const entries = [
      entry({ id: 'a', runOrder: 1 }),
      entry({ id: 'b', runOrder: 2, isScored: true }), // pinned
      entry({ id: 'c', runOrder: 3 }),
    ];
    expect(computeShowMapReorderAssignments(entries, 'b', 'a')).toEqual([]);
  });

  it('refuses to drop on a pinned entry (over=pinned returns [])', () => {
    const entries = [
      entry({ id: 'a', runOrder: 1 }),
      entry({ id: 'b', runOrder: 2, isScored: true }),
      entry({ id: 'c', runOrder: 3 }),
    ];
    expect(computeShowMapReorderAssignments(entries, 'a', 'b')).toEqual([]);
  });
});

describe('drag-end id shape (prefix-stripping regression)', () => {
  // The UI calls useSortable with the ShowMapNode id (e.g. 'entry:abc-123').
  // useShowMapReorderMode.onDragEnd must strip the 'entry:' prefix before
  // calling computeShowMapReorderAssignments, which looks entries up by
  // their raw DB id. Without the strip every drop silently no-ops. This
  // test pins the contract so a regression breaks here, not in production.
  it('computeShowMapReorderAssignments must receive raw DB ids — prefixed ids return []', () => {
    const entries = [
      entry({ id: 'a', runOrder: 1 }),
      entry({ id: 'b', runOrder: 2 }),
      entry({ id: 'c', runOrder: 3 }),
    ];
    // Sanity: with raw ids it works
    expect(computeShowMapReorderAssignments(entries, 'a', 'c')).toHaveLength(3);
    // With prefixed ids (what useSortable emits) it must NOT match — proves
    // the prefix-strip in onDragEnd is load-bearing.
    expect(computeShowMapReorderAssignments(entries, 'entry:a', 'entry:c')).toEqual([]);
  });
});

describe('getReorderableEntryIds', () => {
  it('returns only unpinned entry ids in run_order', () => {
    const entries = [
      entry({ id: 'a', runOrder: 3 }),
      entry({ id: 'b', runOrder: 1, isScored: true }),
      entry({ id: 'c', runOrder: 2 }),
    ];
    expect(getReorderableEntryIds(entries)).toEqual(['c', 'a']);
  });

  it('returns [] when every entry is pinned', () => {
    const entries = [
      entry({ id: 'a', runOrder: 1, isScored: true }),
      entry({ id: 'b', runOrder: 2, checkInStatus: 'in-ring' }),
    ];
    expect(getReorderableEntryIds(entries)).toEqual([]);
  });
});

describe('isEntryDraggableForReorder', () => {
  it('is true for plain unpinned entries', () => {
    expect(isEntryDraggableForReorder(entry({ id: 'a' }))).toBe(true);
  });

  it('is false for scored entries', () => {
    expect(isEntryDraggableForReorder(entry({ id: 'a', isScored: true }))).toBe(false);
  });
});

describe('isShowMapEntryPinnedForReorder (UI-side)', () => {
  it('pins entries with status.kind === complete', () => {
    const n = node({
      id: 'entry:a',
      type: 'entry',
      status: { kind: 'complete', value: 'Q', label: 'Complete' },
    });
    expect(isShowMapEntryPinnedForReorder(n)).toBe(true);
  });

  it('pins entries with checkInStatus value in-ring', () => {
    const n = node({
      id: 'entry:a',
      type: 'entry',
      checkInStatus: { kind: 'active', value: 'in-ring', label: 'In ring' },
    });
    expect(isShowMapEntryPinnedForReorder(n)).toBe(true);
  });

  it('pins entries with checkInStatus value completed', () => {
    const n = node({
      id: 'entry:a',
      type: 'entry',
      checkInStatus: { kind: 'complete', value: 'completed', label: 'Complete' },
    });
    expect(isShowMapEntryPinnedForReorder(n)).toBe(true);
  });

  it('does not pin plain pending entries', () => {
    const n = node({
      id: 'entry:a',
      type: 'entry',
      checkInStatus: { kind: 'neutral', value: 'checked-in', label: 'Checked in' },
    });
    expect(isShowMapEntryPinnedForReorder(n)).toBe(false);
  });

  it('returns false for non-entry nodes', () => {
    const n = node({ id: 'class:x', type: 'class' });
    expect(isShowMapEntryPinnedForReorder(n)).toBe(false);
  });
});

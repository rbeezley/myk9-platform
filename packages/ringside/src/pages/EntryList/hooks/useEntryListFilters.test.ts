import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntryListFilters } from './useEntryListFilters';
import type { Entry } from '../../../stores/entryStore';

function entry(over: Partial<Entry> & { id: string; armband: number }): Entry {
  return {
    callName: `Dog ${over.armband}`,
    breed: 'Golden Retriever',
    handler: 'Handler',
    isScored: false,
    status: 'no-status',
    classId: 'c1',
    className: 'Novice A',
    ...over,
  };
}

const noStatusEntries: Entry[] = [
  entry({ id: 'c', armband: 3, exhibitorOrder: 3 }),
  entry({ id: 'a', armband: 1, exhibitorOrder: 1 }),
  entry({ id: 'b', armband: 2, exhibitorOrder: 2 }),
];

describe('useEntryListFilters — gate bubble (MYK9-83)', () => {
  it('leaves the pending sort UNCHANGED when no entry carries a gate status', () => {
    const withBubble = renderHook(() =>
      useEntryListFilters({
        entries: noStatusEntries,
        prioritizeInRing: true,
        deprioritizePulled: true,
        defaultSort: 'run',
      })
    );
    const withoutBubble = renderHook(() =>
      useEntryListFilters({
        entries: noStatusEntries,
        prioritizeInRing: true,
        deprioritizePulled: true,
        prioritizeAtGate: false,
        defaultSort: 'run',
      })
    );

    expect(withBubble.result.current.pendingEntries.map(e => e.id)).toEqual(['a', 'b', 'c']);
    expect(withBubble.result.current.pendingEntries.map(e => e.id)).toEqual(
      withoutBubble.result.current.pendingEntries.map(e => e.id)
    );
  });

  it('bubbles at-gate above come-to-gate above plain pending when statuses exist', () => {
    const entries: Entry[] = [
      entry({ id: 'a', armband: 1, exhibitorOrder: 1 }),
      entry({ id: 'b', armband: 2, exhibitorOrder: 2, status: 'come-to-gate' }),
      entry({ id: 'c', armband: 9, exhibitorOrder: 9, status: 'at-gate' }),
    ];
    const { result } = renderHook(() =>
      useEntryListFilters({
        entries,
        prioritizeInRing: true,
        deprioritizePulled: true,
        defaultSort: 'run',
      })
    );
    expect(result.current.pendingEntries.map(e => e.id)).toEqual(['c', 'b', 'a']);
  });

  it('keeps in-ring first and pulled last regardless of gate statuses', () => {
    const entries: Entry[] = [
      entry({ id: 'gate', armband: 5, exhibitorOrder: 5, status: 'at-gate' }),
      entry({ id: 'ring', armband: 8, exhibitorOrder: 8, status: 'in-ring' }),
      entry({ id: 'pulled', armband: 1, exhibitorOrder: 1, status: 'pulled' }),
      entry({ id: 'plain', armband: 2, exhibitorOrder: 2 }),
    ];
    const { result } = renderHook(() =>
      useEntryListFilters({
        entries,
        prioritizeInRing: true,
        deprioritizePulled: true,
        defaultSort: 'run',
      })
    );
    expect(result.current.pendingEntries.map(e => e.id)).toEqual([
      'ring',
      'gate',
      'plain',
      'pulled',
    ]);
  });

  it('does not bubble when the caller opts out', () => {
    const entries: Entry[] = [
      entry({ id: 'a', armband: 1, exhibitorOrder: 1 }),
      entry({ id: 'c', armband: 9, exhibitorOrder: 9, status: 'at-gate' }),
    ];
    const { result } = renderHook(() =>
      useEntryListFilters({
        entries,
        prioritizeInRing: true,
        prioritizeAtGate: false,
        defaultSort: 'run',
      })
    );
    expect(result.current.pendingEntries.map(e => e.id)).toEqual(['a', 'c']);
  });
});


/**
 * A and B are two competitions that ran together. The sections exist PRECISELY
 * so each is placed independently, which means the merged set holds two 1sts,
 * two 2nds, and so on -- ordering by placement number alone interleaves them
 * and presents a ranking nobody competed in.
 *
 * The deleted combined page's own comparator grouped by section first. The
 * MYK9-260 collapse routed combined through this shared hook and lost that,
 * until Codex caught it on the PR.
 */
describe('useEntryListFilters - placement sort keeps combined sections apart', () => {
  const combined: Entry[] = [
    entry({ id: 'b1', armband: 20, section: 'B', isScored: true, placement: 1 }),
    entry({ id: 'a2', armband: 11, section: 'A', isScored: true, placement: 2 }),
    entry({ id: 'b2', armband: 21, section: 'B', isScored: true, placement: 2 }),
    entry({ id: 'a1', armband: 10, section: 'A', isScored: true, placement: 1 }),
  ];

  it('groups by section before placement, so each section reads 1st then 2nd', () => {
    const { result } = renderHook(() =>
      useEntryListFilters({
        entries: combined,
        supportSectionFilter: true,
        defaultSort: 'placement',
      })
    );

    // Placement sort is only offered on the Completed tab, which is also the
    // only tab these scored entries appear on.
    act(() => result.current.setActiveTab('completed'));

    expect(result.current.completedEntries.map(e => e.id)).toEqual(['a1', 'a2', 'b1', 'b2']);
  });

  it('still orders a single class by placement alone', () => {
    // Every entry carries the same section (or none), so the section compare
    // is a no-op and this must be unchanged by the guard above.
    const single: Entry[] = [
      entry({ id: 'x2', armband: 2, isScored: true, placement: 2 }),
      entry({ id: 'x1', armband: 1, isScored: true, placement: 1 }),
      entry({ id: 'x3', armband: 3, isScored: true, placement: 3 }),
    ];

    const { result } = renderHook(() =>
      useEntryListFilters({ entries: single, defaultSort: 'placement' })
    );

    act(() => result.current.setActiveTab('completed'));

    expect(result.current.completedEntries.map(e => e.id)).toEqual(['x1', 'x2', 'x3']);
  });
});

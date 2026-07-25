import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
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

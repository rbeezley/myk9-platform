import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/replication', () => ({ replicatedEntriesTable: {} }));

import { useEntryStore, type SyncableShowEntry } from '@/store/entryStore';
import { useEntriesByClass, useFilteredEntries } from './useFilteredEntries';

function entry(id: string, over: Partial<SyncableShowEntry> = {}): SyncableShowEntry {
  return {
    id,
    showId: 'show-1',
    classId: 'class-1',
    dogId: `dog-${id}`,
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...over,
  } as SyncableShowEntry;
}

function setEntries(entries: SyncableShowEntry[]) {
  act(() => {
    useEntryStore.setState({ entries });
  });
}

describe('useFilteredEntries', () => {
  beforeEach(() => {
    useEntryStore.setState({ entries: [], isLoading: false, error: null });
  });

  it('returns the filtered entries for the store contents', () => {
    setEntries([entry('a'), entry('b', { classId: 'class-2' })]);
    const { result } = renderHook(() => useEntriesByClass('class-1'));
    expect(result.current.map(e => (e as SyncableShowEntry).id)).toEqual(['a']);
  });

  it('does not re-render or re-run the filter for a write to an unrelated slice', () => {
    setEntries([entry('a')]);
    const filter = vi.fn((all: unknown[]) => all);
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useFilteredEntries(filter, []);
    });
    const rendersAfterMount = renders;
    const filterCallsAfterMount = filter.mock.calls.length;

    act(() => {
      useEntryStore.setState({ isLoading: true });
    });
    act(() => {
      useEntryStore.setState({ error: 'boom' });
    });

    expect(renders).toBe(rendersAfterMount);
    expect(filter.mock.calls.length).toBe(filterCallsAfterMount);
  });

  it('does not re-run the filter when only an inline filterFn identity changes', () => {
    setEntries([entry('a')]);
    const filter = vi.fn((all: unknown[]) => all);
    const { rerender } = renderHook(() => useFilteredEntries(all => filter(all), []));
    const callsAfterMount = filter.mock.calls.length;
    rerender();
    rerender();
    expect(filter.mock.calls.length).toBe(callsAfterMount);
  });

  it('keeps the same array reference when rebuilt entries carry the same content', () => {
    setEntries([entry('a')]);
    const { result } = renderHook(() => useEntriesByClass('class-1'));
    const first = result.current;
    setEntries([entry('a')]);
    expect(result.current).toBe(first);
  });

  it('updates when an entry changes with the same ids (new updatedAt)', () => {
    setEntries([entry('a', { competitionData: { qualified: false } as never })]);
    const { result } = renderHook(() => useEntriesByClass('class-1'));
    const first = result.current;

    setEntries([
      entry('a', {
        updatedAt: '2026-10-01T10:05:00.000Z',
        competitionData: { qualified: true } as never,
      }),
    ]);
    expect(result.current).not.toBe(first);
    expect((result.current[0] as SyncableShowEntry).competitionData).toMatchObject({
      qualified: true,
    });
  });

  it('falls back to competitionData content for entries without updatedAt', () => {
    const noStamp = (qualified: boolean) =>
      entry('a', {
        updatedAt: undefined as never,
        competitionData: { qualified } as never,
      });
    setEntries([noStamp(false)]);
    const { result } = renderHook(() => useEntriesByClass('class-1'));
    const first = result.current;

    setEntries([noStamp(false)]);
    expect(result.current).toBe(first);

    setEntries([noStamp(true)]);
    expect(result.current).not.toBe(first);
    expect((result.current[0] as SyncableShowEntry).competitionData).toMatchObject({
      qualified: true,
    });
  });

  it('re-filters when the dependencies change', () => {
    setEntries([entry('a'), entry('b', { classId: 'class-2' })]);
    const { result, rerender } = renderHook(({ classId }) => useEntriesByClass(classId), {
      initialProps: { classId: 'class-1' },
    });
    expect(result.current.map(e => (e as SyncableShowEntry).id)).toEqual(['a']);
    rerender({ classId: 'class-2' });
    expect(result.current.map(e => (e as SyncableShowEntry).id)).toEqual(['b']);
  });
});

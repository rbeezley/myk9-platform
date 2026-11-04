/**
 * MYK9-1551: `initialFilters` seeds the hook's four filter states, so a host
 * that returns from the Ringside menu can reopen the list where it was left.
 */
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

const entries: Entry[] = [
  entry({ id: 'p', armband: 1, callName: 'Pending Pup' }),
  entry({ id: 'd', armband: 2, callName: 'Done Dog', isScored: true, resultStatus: 'qualified' }),
];

describe('useEntryListFilters initialFilters (MYK9-1551)', () => {
  it('defaults to Pending, no search, all sections, and the default sort without it', () => {
    const { result } = renderHook(() => useEntryListFilters({ entries, defaultSort: 'run' }));
    expect(result.current.activeTab).toBe('pending');
    expect(result.current.searchTerm).toBe('');
    expect(result.current.sectionFilter).toBe('all');
    expect(result.current.sortBy).toBe('run');
  });

  it('seeds tab, sort, search and section filter from initialFilters', () => {
    const { result } = renderHook(() =>
      useEntryListFilters({
        entries,
        defaultSort: 'run',
        initialFilters: {
          activeTab: 'completed',
          sortBy: 'placement',
          searchTerm: 'done',
          sectionFilter: 'B',
        },
      })
    );
    expect(result.current.activeTab).toBe('completed');
    expect(result.current.sortBy).toBe('placement');
    expect(result.current.searchTerm).toBe('done');
    expect(result.current.sectionFilter).toBe('B');
  });

  it('applies the seeded tab and search to the rows it returns', () => {
    const { result } = renderHook(() =>
      useEntryListFilters({
        entries,
        defaultSort: 'run',
        initialFilters: {
          activeTab: 'completed',
          sortBy: 'armband',
          searchTerm: 'done',
          sectionFilter: 'all',
        },
      })
    );
    expect(result.current.completedEntries.map(e => e.id)).toEqual(['d']);
  });
});

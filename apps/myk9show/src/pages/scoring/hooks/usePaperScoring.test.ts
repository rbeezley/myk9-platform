// apps/myk9show/src/pages/scoring/hooks/usePaperScoring.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePaperScoring } from './usePaperScoring';
import type { ScoringEntry } from '../types';

// Mock the replicated table
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    updateEntry: vi.fn().mockResolvedValue(undefined),
  },
}));

function makeEntry(overrides: Partial<ScoringEntry> = {}): ScoringEntry {
  return {
    id: 1,
    entryId: 'entry-1',
    classId: 'class-1',
    dogId: 'dog-1',
    callName: 'Buddy',
    handler: 'Smith',
    breed: 'Lab',
    armband: 101,
    status: 'pending',
    inRing: false,
    isScored: false,
    exhibitorOrder: 1,
    ...overrides,
  };
}

const entries: ScoringEntry[] = [
  makeEntry({ entryId: 'e1', exhibitorOrder: 1 }),
  makeEntry({ entryId: 'e2', exhibitorOrder: 2, armband: 102 }),
  makeEntry({ entryId: 'e3', exhibitorOrder: 3, armband: 103, isScored: true, status: 'scored' }),
];

describe('usePaperScoring', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts with no selection', () => {
    const { result } = renderHook(() => usePaperScoring(entries, 'class-1', 'user-1'));
    expect(result.current.selectedEntryId).toBeNull();
  });

  it('selectEntry updates selectedEntryId', () => {
    const { result } = renderHook(() => usePaperScoring(entries, 'class-1', 'user-1'));
    act(() => result.current.selectEntry('e1'));
    expect(result.current.selectedEntryId).toBe('e1');
  });

  it('nextUnscored returns first pending entry by exhibitorOrder', () => {
    const { result } = renderHook(() => usePaperScoring(entries, 'class-1', 'user-1'));
    expect(result.current.nextUnscored()).toBe('e1');
  });

  it('nextUnscored skips scored entries', () => {
    const allScored = entries.map(e => ({ ...e, isScored: true, status: 'scored' as const }));
    const { result } = renderHook(() => usePaperScoring(allScored, 'class-1', 'user-1'));
    expect(result.current.nextUnscored()).toBeNull();
  });

  it('saveEntry calls updateEntry with correct fields for Q result', async () => {
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    const { result } = renderHook(() => usePaperScoring(entries, 'class-1', 'user-1'));
    await act(() => result.current.saveEntry('e1', 'Q', '12345', 0));
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({
        result_status: 'Qualified',
        resultStatus: 'Qualified',
        search_time_seconds: 83.45,
        searchTimeSeconds: 83.45,
        total_faults: 0,
        totalFaults: 0,
        checkInStatus: 'completed',
        check_in_status: 'completed',
      })
    );
  });

  it('saveEntry writes 0 seconds for empty time on NQ', async () => {
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    const { result } = renderHook(() => usePaperScoring(entries, 'class-1', 'user-1'));
    await act(() => result.current.saveEntry('e1', 'NQ', '', 0));
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({
        result_status: 'Not Qualified',
        search_time_seconds: 0,
      })
    );
  });

  it('saveAndNext selects next unscored entry after saving', async () => {
    const { result } = renderHook(() => usePaperScoring(entries, 'class-1', 'user-1'));
    await act(() => result.current.saveAndNext('e1', 'Q', '12345', 0));
    // After saving e1, next unscored is e2 (e3 is already scored)
    expect(result.current.selectedEntryId).toBe('e2');
  });
});

// apps/myk9show/src/pages/scoring/hooks/usePaperScoring.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { firstScorableEntryId, resolveOnScreenEntryId, usePaperScoring } from './usePaperScoring';
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
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('opens on the first scorable dog', () => {
    const { result } = renderHook(() => usePaperScoring(entries, 'user-1'));
    expect(result.current.onScreenEntryId).toBe('e1');
  });

  it('a saved dog stays on screen', async () => {
    const { result } = renderHook(() => usePaperScoring(entries, 'user-1'));
    act(() => result.current.selectEntry('e2'));
    await act(() => result.current.saveEntry('e2', 'Q', '4231', 0));
    expect(result.current.onScreenEntryId).toBe('e2');
  });

  it('a cleared dog stays on screen', async () => {
    const { result } = renderHook(() => usePaperScoring(entries, 'user-1'));
    await act(() => result.current.clearEntry('e3'));
    expect(result.current.onScreenEntryId).toBe('e3');
  });

  describe('resolveOnScreenEntryId (MYK9-1130)', () => {
    const sorted = [entries[0]!, entries[1]!, entries[2]!];

    it('shows the requested dog while it is listed', () => {
      expect(resolveOnScreenEntryId(sorted, 'e3', 'sequential')).toBe('e3');
      expect(resolveOnScreenEntryId(sorted, 'e3', 'split')).toBe('e3');
    });

    it('moves to the first scorable dog when the requested one leaves', () => {
      const withoutE1 = [entries[1]!, entries[2]!];
      expect(resolveOnScreenEntryId(withoutE1, 'e1', 'sequential')).toBe('e2');
      expect(resolveOnScreenEntryId(withoutE1, 'e1', 'split')).toBe('e2');
    });

    it('shows nothing for an empty class, and the first scorable dog once it refills', () => {
      expect(resolveOnScreenEntryId([], 'e1', 'sequential')).toBeNull();
      expect(resolveOnScreenEntryId([], undefined, 'split')).toBeNull();
      expect(resolveOnScreenEntryId([entries[1]!], 'e1', 'sequential')).toBe('e2');
    });

    it('a closed list panel shows nothing; card mode always shows a dog', () => {
      expect(resolveOnScreenEntryId(sorted, null, 'split')).toBeNull();
      expect(resolveOnScreenEntryId(sorted, null, 'sequential')).toBe('e1');
    });

    it('falls back to the first dog when every dog is scored', () => {
      const allScored = sorted.map(e => ({ ...e, isScored: true }));
      expect(firstScorableEntryId(allScored)).toBe('e1');
    });
  });

  it('defaults to split list mode even when an old card preference was stored', () => {
    localStorage.setItem('paper-scoring-mode:user-1', 'sequential');
    const { result } = renderHook(() => usePaperScoring(entries, 'user-1'));
    expect(result.current.mode).toBe('split');
  });

  it('selectEntry puts that dog on screen', () => {
    const { result } = renderHook(() => usePaperScoring(entries, 'user-1'));
    act(() => result.current.selectEntry('e2'));
    expect(result.current.onScreenEntryId).toBe('e2');
  });

  it('nextUnscored returns first pending entry by exhibitorOrder', () => {
    const { result } = renderHook(() => usePaperScoring(entries, 'user-1'));
    expect(result.current.nextUnscored()).toBe('e1');
  });

  it('nextUnscored skips scored entries', () => {
    const allScored = entries.map(e => ({ ...e, isScored: true, status: 'scored' as const }));
    const { result } = renderHook(() => usePaperScoring(allScored, 'user-1'));
    expect(result.current.nextUnscored()).toBeNull();
  });

  it('saveEntry calls updateEntry with correct fields for Q result', async () => {
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    const { result } = renderHook(() => usePaperScoring(entries, 'user-1'));
    await act(() => result.current.saveEntry('e1', 'Q', '12345', 0));
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({
        result_status: 'qualified',
        resultStatus: 'qualified',
        disqualification_reason: null,
        search_time_seconds: 83.45,
        searchTimeSeconds: 83.45,
        total_faults: 0,
        totalFaults: 0,
        is_scored: true,
        isScored: true,
        scoring_completed_at: expect.any(String),
        scoringCompletedAt: expect.any(String),
        checkInStatus: 'completed',
        check_in_status: 'completed',
      })
    );
  });

  it('saveEntry writes 0 seconds for empty time on NQ', async () => {
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    const { result } = renderHook(() => usePaperScoring(entries, 'user-1'));
    await act(() => result.current.saveEntry('e1', 'NQ', '', 0));
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({
        result_status: 'nq',
        search_time_seconds: 0,
      })
    );
  });

  it('saveEntry writes reasons for NQ and EX', async () => {
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    const { result } = renderHook(() => usePaperScoring(entries, 'user-1'));

    await act(() => result.current.saveEntry('e1', 'NQ', '', 0, 'Incorrect Call'));
    expect(replicatedEntriesTable.updateEntry).toHaveBeenLastCalledWith(
      'e1',
      expect.objectContaining({
        result_status: 'nq',
        disqualification_reason: 'Incorrect Call',
      })
    );

    await act(() => result.current.saveEntry('e2', 'EX', '', 0, 'Handler Request'));
    expect(replicatedEntriesTable.updateEntry).toHaveBeenLastCalledWith(
      'e2',
      expect.objectContaining({
        result_status: 'excused',
        disqualification_reason: 'Handler Request',
      })
    );
  });

  it('saveEntry writes a DQ as disqualified with its reason, apart from excused', async () => {
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    const { result } = renderHook(() => usePaperScoring(entries, 'user-1'));

    await act(() => result.current.saveEntry('e1', 'DQ', '', 0, '  Bit the handler  '));
    expect(replicatedEntriesTable.updateEntry).toHaveBeenLastCalledWith(
      'e1',
      expect.objectContaining({
        result_status: 'disqualified',
        resultStatus: 'disqualified',
        disqualification_reason: 'Bit the handler',
        is_scored: true,
      })
    );
  });

  it('saveEntry writes the lowercase DB enum for ABS and EX', async () => {
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    const { result } = renderHook(() => usePaperScoring(entries, 'user-1'));

    await act(() => result.current.saveEntry('e1', 'ABS', '', 0));
    expect(replicatedEntriesTable.updateEntry).toHaveBeenLastCalledWith(
      'e1',
      expect.objectContaining({ result_status: 'absent', resultStatus: 'absent' })
    );

    await act(() => result.current.saveEntry('e2', 'EX', '', 0));
    expect(replicatedEntriesTable.updateEntry).toHaveBeenLastCalledWith(
      'e2',
      expect.objectContaining({ result_status: 'excused', resultStatus: 'excused' })
    );
  });

  it('clearEntry resets a dog to no result', async () => {
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    const { result } = renderHook(() => usePaperScoring(entries, 'user-1'));

    await act(() => result.current.clearEntry('e1'));

    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({
        result_status: 'pending',
        resultStatus: 'pending',
        is_scored: false,
        isScored: false,
        search_time_seconds: 0,
        searchTimeSeconds: 0,
        total_faults: 0,
        totalFaults: 0,
        finalPlacement: null,
        scoringCompletedAt: null,
        scoring_completed_at: null,
        disqualification_reason: null,
      })
    );
  });
});

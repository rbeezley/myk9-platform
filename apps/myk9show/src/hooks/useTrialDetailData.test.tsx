import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/store/trialStore', () => ({ useTrialStore: vi.fn() }));
vi.mock('@/store/showStore', () => ({ useShowStore: vi.fn() }));
vi.mock('@/hooks/queries/useTrialsDatabase', () => ({ useTrialQuery: vi.fn() }));
vi.mock('@/hooks/queries/useShowsDatabase', () => ({ useShowQuery: vi.fn() }));

import { useTrialStore } from '@/store/trialStore';
import { useShowStore } from '@/store/showStore';
import { useTrialQuery } from '@/hooks/queries/useTrialsDatabase';
import { useShowQuery } from '@/hooks/queries/useShowsDatabase';
import { useTrialDetailData } from './useTrialDetailData';

interface StoreState {
  trials: Array<{ id: string; showId: string }>;
  selectedTrialId: string | null;
  shows: Array<{ id: string }>;
}

function setStores(state: Partial<StoreState> = {}) {
  const full: StoreState = {
    trials: [],
    selectedTrialId: null,
    shows: [],
    ...state,
  };
  vi.mocked(useTrialStore).mockReturnValue({
    trials: full.trials,
    selectedTrialId: full.selectedTrialId,
  } as unknown as ReturnType<typeof useTrialStore>);
  vi.mocked(useShowStore).mockReturnValue({
    shows: full.shows,
  } as unknown as ReturnType<typeof useShowStore>);
}

function setTrialQuery(
  result: { data?: unknown; isSuccess?: boolean; isError?: boolean } = {}
) {
  vi.mocked(useTrialQuery).mockReturnValue({
    data: result.data ?? null,
    isSuccess: result.isSuccess ?? false,
    isError: result.isError ?? false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useTrialQuery>);
}

function setShowQuery(data: unknown = undefined) {
  vi.mocked(useShowQuery).mockReturnValue({ data } as unknown as ReturnType<typeof useShowQuery>);
}

describe('useTrialDetailData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStores();
    setTrialQuery();
    setShowQuery();
  });

  it('uses the store trial when warm and disables the anon fallback query', () => {
    setStores({ trials: [{ id: 't1', showId: 's1' }], selectedTrialId: 't1', shows: [{ id: 's1' }] });
    const { result } = renderHook(() => useTrialDetailData('t1'));
    expect(result.current.currentTrial?.id).toBe('t1');
    expect(result.current.parentShow?.id).toBe('s1');
    // Warm store → fallback query disabled (called with undefined id).
    expect(vi.mocked(useTrialQuery)).toHaveBeenCalledWith(undefined);
  });

  it('falls back to the anon by-id read for the trial when the store is cold', () => {
    setStores({ trials: [], selectedTrialId: 't1', shows: [] });
    setTrialQuery({ data: { id: 't1', showId: 's1' }, isSuccess: true });
    setShowQuery({ id: 's1' });
    const { result } = renderHook(() => useTrialDetailData('t1'));
    expect(result.current.currentTrial?.id).toBe('t1');
    expect(result.current.parentShow?.id).toBe('s1');
    // Cold store → fallback enabled with the URL trialId.
    expect(vi.mocked(useTrialQuery)).toHaveBeenCalledWith('t1');
  });

  it('falls back to the anon by-id read for the parent show when only the show is cold', () => {
    setStores({ trials: [{ id: 't1', showId: 's1' }], selectedTrialId: 't1', shows: [] });
    setShowQuery({ id: 's1' });
    const { result } = renderHook(() => useTrialDetailData('t1'));
    expect(result.current.parentShow?.id).toBe('s1');
    expect(vi.mocked(useShowQuery)).toHaveBeenCalledWith('s1');
  });

  it('reports a resolved-but-missing trial (not-found, not error)', () => {
    setStores({ trials: [], selectedTrialId: 't1', shows: [] });
    setTrialQuery({ data: null, isSuccess: true });
    const { result } = renderHook(() => useTrialDetailData('t1'));
    expect(result.current.currentTrial).toBeUndefined();
    expect(result.current.fallbackTrialResolved).toBe(true);
    expect(result.current.fallbackTrialError).toBe(false);
  });

  it('surfaces a fallback fetch error distinctly from not-found', () => {
    setStores({ trials: [], selectedTrialId: 't1', shows: [] });
    setTrialQuery({ data: null, isError: true });
    const { result } = renderHook(() => useTrialDetailData('t1'));
    expect(result.current.currentTrial).toBeUndefined();
    expect(result.current.fallbackTrialError).toBe(true);
    expect(result.current.fallbackTrialResolved).toBe(false);
  });
});

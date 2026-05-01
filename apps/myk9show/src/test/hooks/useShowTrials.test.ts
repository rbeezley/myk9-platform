import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useShowTrials } from '@/hooks/queries/useShowTrials';
import { createTestQueryClient } from '@/test/utils/testUtils';

vi.mock('@/services/database/trials', () => ({
  getTrialsByShow: vi.fn(),
}));

import { getTrialsByShow } from '@/services/database/trials';
const mockGetTrialsByShow = vi.mocked(getTrialsByShow);

const createWrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useShowTrials', () => {
  it('is disabled when showId is null', () => {
    const { result } = renderHook(() => useShowTrials(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetTrialsByShow).not.toHaveBeenCalled();
  });

  it('fetches trials when showId is provided', async () => {
    const mockTrials = [
      { id: 't1', show_id: 'show-1', trial_date: '2026-04-01' },
      { id: 't2', show_id: 'show-1', trial_date: '2026-04-02' },
    ];
    mockGetTrialsByShow.mockResolvedValue({ data: mockTrials, error: null });

    const { result } = renderHook(() => useShowTrials('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockTrials);
    expect(mockGetTrialsByShow).toHaveBeenCalledWith('show-1');
  });

  it('returns empty array when data is null', async () => {
    mockGetTrialsByShow.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useShowTrials('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });

  it('throws on query error', async () => {
    const dbError = { message: 'DB error', code: '500', details: '' };
    mockGetTrialsByShow.mockResolvedValue({ data: null, error: dbError as never });

    const { result } = renderHook(() => useShowTrials('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

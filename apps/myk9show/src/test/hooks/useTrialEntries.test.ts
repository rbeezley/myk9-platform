import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useTrialEntries } from '@/hooks/queries/useTrialEntries';
import { createTestQueryClient } from '@/test/utils/testUtils';

vi.mock('@/services/database/entries', () => ({
  getEntriesByTrial: vi.fn(),
  getPublicEntriesByTrial: vi.fn(),
}));

// Authenticated viewer → hook takes the full table-read path (getEntriesByTrial).
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'u1' }, loading: false }),
}));

const hydration = vi.hoisted(() => ({ listeners: new Set<() => void>() }));
vi.mock('@/services/database/entries/handlerHydration', () => ({
  subscribeHandlerPeopleHydration: (listener: () => void) => {
    hydration.listeners.add(listener);
    return () => hydration.listeners.delete(listener);
  },
}));

import { getEntriesByTrial } from '@/services/database/entries';
const mockGetEntriesByTrial = vi.mocked(getEntriesByTrial);

const createWrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useTrialEntries', () => {
  it('returns entries for the given trial', async () => {
    const mockEntries = [
      { id: 'e1', class_id: 'c1', entry_status: 'confirmed' },
      { id: 'e2', class_id: 'c2', entry_status: 'pending' },
    ];
    mockGetEntriesByTrial.mockResolvedValue({ data: mockEntries, error: null });

    const { result } = renderHook(() => useTrialEntries('trial-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockEntries);
    expect(mockGetEntriesByTrial).toHaveBeenCalledWith('trial-1');
  });

  it('is disabled when trialId is empty', () => {
    const { result } = renderHook(() => useTrialEntries(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetEntriesByTrial).not.toHaveBeenCalled();
  });

  it('throws on query error', async () => {
    const dbError = { message: 'DB error', code: '500', details: '' };
    mockGetEntriesByTrial.mockResolvedValue({ data: [], error: dbError as never });

    const { result } = renderHook(() => useTrialEntries('trial-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('refetches when people hydration lands, keeping the rows on screen meanwhile (MYK9-1320)', async () => {
    mockGetEntriesByTrial.mockReset();
    mockGetEntriesByTrial.mockResolvedValueOnce({ data: [{ id: 'e1' }], error: null });
    let release: (value: { data: unknown[]; error: null }) => void = () => {};
    mockGetEntriesByTrial.mockImplementationOnce(
      () => new Promise(resolve => (release = resolve as typeof release)) as never
    );

    const seen: Array<unknown> = [];
    const { result } = renderHook(
      () => {
        const query = useTrialEntries('trial-1');
        seen.push(query.data);
        return query;
      },
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'e1' }]));
    seen.length = 0;

    act(() => hydration.listeners.forEach(listener => listener()));
    await waitFor(() => expect(mockGetEntriesByTrial).toHaveBeenCalledTimes(2));
    expect(result.current.data).toEqual([{ id: 'e1' }]);

    await act(async () => release({ data: [{ id: 'e1' }, { id: 'e2' }], error: null }));
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(seen).not.toContain(undefined);
  });
});

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTrialEntries } from '@/hooks/queries/useTrialEntries';
import { createTestQueryClient } from '@/test/utils/testUtils';

vi.mock('@/services/database/queries/entry-query-lookups', () => ({
  getEntriesByTrial: vi.fn(),
}));

import { getEntriesByTrial } from '@/services/database/queries/entry-query-lookups';
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
});

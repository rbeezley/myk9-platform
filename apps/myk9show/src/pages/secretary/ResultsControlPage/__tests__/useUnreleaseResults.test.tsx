import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';

const mockUpdateClass = vi.fn();

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    updateClass: (...args: unknown[]) => mockUpdateClass(...args),
  },
}));

import { useUnreleaseResults } from '@/hooks/mutations/useUnreleaseResults';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useUnreleaseResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateClass.mockResolvedValue('mutation-1');
  });

  it('clears resultsReleasedAt/resultsReleasedBy through replicated writes', async () => {
    const { result } = renderHook(() => useUnreleaseResults(), { wrapper: createWrapper() });

    result.current.mutate({ classIds: ['class-1', 'class-2'], showId: 'show-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdateClass).toHaveBeenCalledWith(
      'class-1',
      expect.objectContaining({
        resultsReleasedAt: null,
        results_released_at: null,
        resultsReleasedBy: null,
        results_released_by: null,
      })
    );
    expect(mockUpdateClass).toHaveBeenCalledWith(
      'class-2',
      expect.objectContaining({
        resultsReleasedAt: null,
        results_released_at: null,
        resultsReleasedBy: null,
        results_released_by: null,
      })
    );
  });

  it('returns unreleased/failed split on a partial write failure', async () => {
    mockUpdateClass
      .mockResolvedValueOnce('mutation-1')
      .mockRejectedValueOnce(new Error('offline queue full'));

    const { result } = renderHook(() => useUnreleaseResults(), { wrapper: createWrapper() });
    result.current.mutate({ classIds: ['class-1', 'class-2'], showId: 'show-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ unreleased: ['class-1'], failed: ['class-2'] });
  });

  it('no-ops without calling updateClass when classIds is empty', async () => {
    const { result } = renderHook(() => useUnreleaseResults(), { wrapper: createWrapper() });
    result.current.mutate({ classIds: [], showId: 'show-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdateClass).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({ unreleased: [], failed: [] });
  });
});

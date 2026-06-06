import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';

const mockUpdate = vi.fn();
const mockIn = vi.fn(() => ({ data: null, error: null }));
const mockFrom = vi.fn(() => ({ update: mockUpdate }));
const mockUpdateClass = vi.fn();
mockUpdate.mockReturnValue({ in: mockIn });

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    updateClass: (...args: unknown[]) => mockUpdateClass(...args),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-123' } }),
}));

import { useReleaseResults } from '@/hooks/mutations/useReleaseResults';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useReleaseResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ in: mockIn });
    mockIn.mockResolvedValue({ data: null, error: null });
    mockUpdateClass.mockResolvedValue('mutation-1');
  });

  it('queues results release through replicated classes', async () => {
    const { result } = renderHook(() => useReleaseResults(), { wrapper: createWrapper() });

    result.current.mutate({ classIds: ['class-1', 'class-2'], showId: 'show-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdateClass).toHaveBeenCalledWith(
      'class-1',
      expect.objectContaining({
        resultsReleasedAt: expect.any(String),
        results_released_at: expect.any(String),
        resultsReleasedBy: 'user-123',
        results_released_by: 'user-123',
      })
    );
    expect(mockUpdateClass).toHaveBeenCalledWith(
      'class-2',
      expect.objectContaining({
        resultsReleasedAt: expect.any(String),
        results_released_at: expect.any(String),
        resultsReleasedBy: 'user-123',
        results_released_by: 'user-123',
      })
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

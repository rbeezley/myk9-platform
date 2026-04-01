import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';

// Mock supabase
const mockUpdate = vi.fn();
const mockIn = vi.fn(() => ({ data: null, error: null }));
mockUpdate.mockReturnValue({ in: mockIn });

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({ update: mockUpdate }),
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
  });

  it('updates classes table with results_released_at', async () => {
    const { result } = renderHook(() => useReleaseResults(), { wrapper: createWrapper() });

    result.current.mutate({ classIds: ['class-1', 'class-2'], showId: 'show-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        results_released_at: expect.any(String),
        results_released_by: 'user-123',
      })
    );
    expect(mockIn).toHaveBeenCalledWith('id', ['class-1', 'class-2']);
  });
});

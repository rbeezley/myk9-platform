import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMyEntries } from '@/hooks/useMyEntries';

// Mock auth
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { id: 'auth-1', databaseUserId: 'person-1' },
  }),
}));

// Mock queryClient exports to avoid side-effects from the real module
vi.mock('@/lib/queryClient', () => ({
  queryKeys: {
    entriesByShow: (showId: string) => ['entries', 'show', showId],
  },
  cacheStrategies: {
    dynamic: { staleTime: 60000, gcTime: 120000 },
  },
}));

// Mock Supabase - chain pattern: from().select().eq().eq().is().order()
const mockData: { data: unknown[] | null; error: unknown } = { data: [], error: null };
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => Promise.resolve(mockData),
            }),
          }),
        }),
      }),
    }),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useMyEntries', () => {
  beforeEach(() => {
    mockData.data = [];
    mockData.error = null;
  });

  it('returns entries grouped by class for the given show', async () => {
    mockData.data = [
      {
        id: 'e1',
        class_id: 'c1',
        armband: '148',
        run_order: 5,
        is_scored: false,
        entry_status: 'confirmed',
        show_id: 'show-1',
        dog: { id: 'd1', call_name: 'Bella' },
        class: { id: 'c1', name: 'Novice JWW', scored_count: 2, total_entries_count: 28 },
      },
      {
        id: 'e2',
        class_id: 'c2',
        armband: '148',
        run_order: 12,
        is_scored: false,
        entry_status: 'confirmed',
        show_id: 'show-1',
        dog: { id: 'd1', call_name: 'Bella' },
        class: { id: 'c2', name: 'Open Standard', scored_count: 0, total_entries_count: 20 },
      },
    ];
    const { result } = renderHook(() => useMyEntries('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entriesByClass).toHaveLength(2);
    expect(result.current.entriesByClass[0].className).toBe('Novice JWW');
  });

  it('calculates dogsAhead based on run order and scored count', async () => {
    mockData.data = [
      {
        id: 'e1',
        class_id: 'c1',
        armband: '148',
        run_order: 5,
        is_scored: false,
        entry_status: 'confirmed',
        show_id: 'show-1',
        dog: { id: 'd1', call_name: 'Bella' },
        class: { id: 'c1', name: 'Novice JWW', scored_count: 2, total_entries_count: 28 },
      },
    ];
    const { result } = renderHook(() => useMyEntries('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // dogsAhead = run_order - scored_count - 1 = 5 - 2 - 1 = 2
    expect(result.current.entriesByClass[0].dogsAhead).toBe(2);
  });

  it('returns empty array when user has no entries', async () => {
    mockData.data = [];
    const { result } = renderHook(() => useMyEntries('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entriesByClass).toHaveLength(0);
  });

  it('returns error state when Supabase query fails', async () => {
    mockData.data = null;
    mockData.error = { message: 'Network error' };
    const { result } = renderHook(() => useMyEntries('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.entriesByClass).toHaveLength(0);
  });
});

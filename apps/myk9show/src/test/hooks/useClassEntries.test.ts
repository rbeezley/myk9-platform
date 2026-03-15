import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useClassEntries } from '@/hooks/useClassEntries';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { id: 'auth-1', databaseUserId: 'person-1' },
  }),
}));

// Mock query keys and cache strategies
vi.mock('@/lib/queryClient', () => ({
  queryKeys: {
    classEntries: (classId: string) => ['entries', 'class', classId],
  },
  cacheStrategies: {
    dynamic: { staleTime: 60000, gcTime: 120000 },
  },
}));

const mockData: { data: unknown[] | null; error: unknown } = { data: [], error: null };
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => Promise.resolve(mockData),
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

describe('useClassEntries', () => {
  beforeEach(() => {
    mockData.data = [];
    mockData.error = null;
  });

  it('splits entries into pending and completed', async () => {
    mockData.data = [
      {
        id: 'e1',
        armband: '142',
        run_order: 1,
        is_scored: true,
        result_status: 'Q',
        entry_status: 'completed',
        is_in_ring: false,
        handler_id: 'other-person',
        dog: { id: 'd1', call_name: 'Ziggy', breed: 'Border Collie' },
      },
      {
        id: 'e2',
        armband: '145',
        run_order: 2,
        is_scored: false,
        entry_status: 'confirmed',
        is_in_ring: false,
        handler_id: 'other-person-2',
        dog: { id: 'd2', call_name: 'Pepper', breed: 'Sheltie' },
      },
      {
        id: 'e3',
        armband: '148',
        run_order: 3,
        is_scored: false,
        entry_status: 'confirmed',
        is_in_ring: false,
        handler_id: 'person-1',
        dog: { id: 'd3', call_name: 'Bella', breed: 'Aussie' },
      },
    ];
    const { result } = renderHook(() => useClassEntries('class-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pending).toHaveLength(2);
    expect(result.current.completed).toHaveLength(1);
  });

  it('marks current user entries with isCurrentUser', async () => {
    mockData.data = [
      {
        id: 'e1',
        armband: '148',
        run_order: 3,
        is_scored: false,
        entry_status: 'confirmed',
        is_in_ring: false,
        handler_id: 'person-1',
        dog: { id: 'd1', call_name: 'Bella', breed: 'Aussie' },
      },
    ];
    const { result } = renderHook(() => useClassEntries('class-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pending[0].isCurrentUser).toBe(true);
  });

  it('calculates dogsAhead for user entries', async () => {
    mockData.data = [
      {
        id: 'e1',
        armband: '142',
        run_order: 1,
        is_scored: false,
        entry_status: 'confirmed',
        is_in_ring: true,
        handler_id: 'other-1',
        dog: { id: 'd1', call_name: 'Ziggy', breed: 'BC' },
      },
      {
        id: 'e2',
        armband: '145',
        run_order: 2,
        is_scored: false,
        entry_status: 'confirmed',
        is_in_ring: false,
        handler_id: 'other-2',
        dog: { id: 'd2', call_name: 'Pepper', breed: 'Sheltie' },
      },
      {
        id: 'e3',
        armband: '148',
        run_order: 3,
        is_scored: false,
        entry_status: 'confirmed',
        is_in_ring: false,
        handler_id: 'person-1',
        dog: { id: 'd3', call_name: 'Bella', breed: 'Aussie' },
      },
    ];
    const { result } = renderHook(() => useClassEntries('class-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const userEntry = result.current.pending.find((e) => e.isCurrentUser);
    expect(userEntry?.dogsAhead).toBe(2); // Ziggy (in ring) + Pepper ahead
  });
});

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabase } from '@/services/database/supabaseClient';
import { useShowJudges } from '@/hooks/queries/useShowJudges';

const mockRpc = vi.mocked(supabase.rpc);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useShowJudges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is disabled when showId is undefined', () => {
    const { result } = renderHook(() => useShowJudges(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('deduplicates judges and sorts by name', async () => {
    // MYK9-474: rows now arrive from the get_show_judges RPC, flat, one per ASSIGNMENT — so the
    // same judge repeats across classes and the hook must still collapse them.
    mockRpc.mockResolvedValue({
      data: [
        { person_id: 'p1', first_name: 'Bob', last_name: 'Jones', class_id: 'c1' },
        { person_id: 'p2', first_name: 'Alice', last_name: 'Smith', class_id: 'c1' },
        { person_id: 'p1', first_name: 'Bob', last_name: 'Jones', class_id: 'c2' },
      ],
      error: null,
    } as never);

    const { result } = renderHook(() => useShowJudges('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0].name).toBe('Alice Smith');
    expect(result.current.data![1].name).toBe('Bob Jones');
  });

  it('calls the get_show_judges RPC, not a people embed', async () => {
    // The defect MYK9-474 fixed was an embed that resolved to null for every anonymous visitor
    // (people!inner + no anon-visible people policy = the row dropped entirely). Pin the
    // mechanism: a future "simplification" back to an embed silently re-breaks the public
    // /shows/:id roster, and a row-shape assertion alone would not notice.
    mockRpc.mockResolvedValue({ data: [], error: null } as never);

    const { result } = renderHook(() => useShowJudges('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith('get_show_judges', { p_show_id: 'show-1' });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

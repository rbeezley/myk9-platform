import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '@/services/database/supabaseClient';
import { useShowJudges } from '@/hooks/queries/useShowJudges';

const mockFrom = vi.mocked(supabase.from);

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
    const mockData = [
      {
        person_id: 'p1',
        people: { id: 'p1', first_name: 'Bob', last_name: 'Jones' },
        classes: { trial_id: 't1', trials: { show_id: 'show-1' } },
      },
      {
        person_id: 'p2',
        people: { id: 'p2', first_name: 'Alice', last_name: 'Smith' },
        classes: { trial_id: 't1', trials: { show_id: 'show-1' } },
      },
      {
        person_id: 'p1',
        people: { id: 'p1', first_name: 'Bob', last_name: 'Jones' },
        classes: { trial_id: 't2', trials: { show_id: 'show-1' } },
      },
    ];

    const mockEq = vi.fn().mockResolvedValue({ data: mockData, error: null });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect } as never);

    const { result } = renderHook(() => useShowJudges('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0].name).toBe('Alice Smith');
    expect(result.current.data![1].name).toBe('Bob Jones');
  });
});

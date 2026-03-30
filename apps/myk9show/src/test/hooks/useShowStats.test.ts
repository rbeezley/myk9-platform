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
import { useShowStats } from '@/hooks/queries/useShowStats';

const mockFrom = vi.mocked(supabase.from);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useShowStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is disabled when showId is undefined', () => {
    const { result } = renderHook(() => useShowStats(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('fetches all entries for a show and merges trial metadata', async () => {
    const mockEntryData = [
      {
        id: 'e1',
        dog_id: 'd1',
        dog_call_name: 'Rex',
        show_id: 'show-1',
        class_id: 'c1',
        class_name: 'Containers Novice',
        class_element: 'Containers',
        class_level: 'Novice',
        result_text: 'Q',
        search_time_seconds: 35,
        total_faults: 0,
        final_placement: 1,
      },
    ];

    const mockClassData = [
      {
        id: 'c1',
        trial_id: 't1',
        trials: { trial_date: '2026-04-01', trial_number: '1' },
      },
    ];

    const mockEq = vi.fn().mockResolvedValue({ data: mockEntryData, error: null });
    const mockEntrySelect = vi.fn().mockReturnValue({ eq: mockEq });
    const mockIn = vi.fn().mockResolvedValue({ data: mockClassData, error: null });
    const mockClassSelect = vi.fn().mockReturnValue({ in: mockIn });

    mockFrom
      .mockReturnValueOnce({ select: mockEntrySelect } as never)
      .mockReturnValueOnce({ select: mockClassSelect } as never);

    const { result } = renderHook(() => useShowStats('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].dogCallName).toBe('Rex');
    expect(result.current.data![0].trialDate).toBe('2026-04-01');
    expect(result.current.data![0].trialNumber).toBe('1');
    expect(mockFrom).toHaveBeenCalledWith('view_entry_with_results');
    expect(mockFrom).toHaveBeenCalledWith('classes');
  });
});

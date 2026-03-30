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
import { useJudgeShowStats } from '@/hooks/queries/useJudgeShowStats';

const mockFrom = vi.mocked(supabase.from);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useJudgeShowStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is disabled when judgeId is undefined', () => {
    const { result } = renderHook(() => useJudgeShowStats(undefined, 'show-1'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('is disabled when showId is undefined', () => {
    const { result } = renderHook(() => useJudgeShowStats('judge-1', undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('fetches entries for a judge at a show', async () => {
    const mockAssignments = [
      {
        class_id: 'c1',
        classes: {
          trial_id: 't1',
          trials: { show_id: 'show-1', trial_date: '2026-04-01', trial_number: '1' },
        },
      },
    ];

    const mockEntries = [
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

    // First call: judge_assignments - chained .eq().eq()
    const mockEq2 = vi.fn().mockResolvedValue({ data: mockAssignments, error: null });
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
    const mockAssignSelect = vi.fn().mockReturnValue({ eq: mockEq1 });

    // Second call: view_entry_with_results - chained .eq().in()
    const mockIn = vi.fn().mockResolvedValue({ data: mockEntries, error: null });
    const mockEntryEq = vi.fn().mockReturnValue({ in: mockIn });
    const mockEntrySelect = vi.fn().mockReturnValue({ eq: mockEntryEq });

    mockFrom
      .mockReturnValueOnce({ select: mockAssignSelect } as never)
      .mockReturnValueOnce({ select: mockEntrySelect } as never);

    const { result } = renderHook(() => useJudgeShowStats('judge-1', 'show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].dogCallName).toBe('Rex');
    expect(result.current.data![0].trialDate).toBe('2026-04-01');
    expect(mockFrom).toHaveBeenCalledWith('judge_assignments');
    expect(mockFrom).toHaveBeenCalledWith('view_entry_with_results');
  });
});

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from '@/services/database/supabaseClient';
import { useShowClassProgress } from '@/hooks/queries/useShowClassProgress';

const mockFrom = vi.mocked(supabase.from);

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('useShowClassProgress', () => {
  it('reads the server-kept class counters for one show, skipping deleted classes', async () => {
    const mockIs = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'c1',
          trial_id: 't1',
          name: 'Buried Master',
          element: 'Buried',
          level: 'Master',
          scored_count: 3,
          results_released_at: null,
          trials: { trial_date: '2026-03-14', trial_number: '2', name: 'Spring Trial' },
        },
      ],
      error: null,
    });
    const mockEq = vi.fn().mockReturnValue({ is: mockIs });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect } as never);

    const { result } = renderHook(() => useShowClassProgress('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith('classes');
    expect(mockEq).toHaveBeenCalledWith('trials.show_id', 'show-1');
    expect(mockIs).toHaveBeenCalledWith('deleted_at', null);
    expect(result.current.data).toEqual([
      {
        classId: 'c1',
        className: 'Buried Master',
        trialId: 't1',
        element: 'Buried',
        level: 'Master',
        scoredCount: 3,
        resultsReleasedAt: null,
        trialName: 'Spring Trial',
        trialNumber: '2',
        trialDate: '2026-03-14',
      },
    ]);
  });
});

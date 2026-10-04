/**
 * MYK9-969: the club's show-wide private switch writes `results_private` and
 * leaves the show's visibility timings exactly as they were.
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error: unknown; status: number };

const readResult = vi.fn<() => Result>();
const upsertCalls = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      upsert: (payload: unknown) => {
        upsertCalls(payload);
        return { abortSignal: () => Promise.resolve({ error: null, status: 201 }) };
      },
      select: () => ({
        eq: () => ({
          abortSignal: () => ({ maybeSingle: () => Promise.resolve(readResult()) }),
        }),
      }),
    }),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

import { useUpdateShowResultsPrivacy } from '../useShowSettingsMutations';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('useUpdateShowResultsPrivacy', () => {
  beforeEach(() => {
    upsertCalls.mockReset();
    readResult.mockReset();
  });

  it('writes results_private and keeps an existing show custom timings verbatim', async () => {
    readResult.mockReturnValue({
      data: {
        preset: null,
        placement_timing: 'manual_release',
        qualification_timing: 'class_complete',
        time_timing: 'manual_release',
        faults_timing: 'immediate',
      },
      error: null,
      status: 200,
    });
    const { result } = renderHook(() => useUpdateShowResultsPrivacy(), { wrapper });

    await act(() => result.current.mutateAsync({ showId: 'show-1', resultsPrivate: true }));

    expect(upsertCalls).toHaveBeenCalledWith(
      expect.objectContaining({
        show_id: 'show-1',
        results_private: true,
        preset: null,
        placement_timing: 'manual_release',
        qualification_timing: 'class_complete',
        time_timing: 'manual_release',
        faults_timing: 'immediate',
        updated_by: 'user-1',
      })
    );
    expect(upsertCalls.mock.calls[0]?.[0]).not.toHaveProperty('self_checkin_enabled');
  });

  it('creates a missing row with the standard defaults', async () => {
    readResult.mockReturnValue({ data: null, error: null, status: 200 });
    const { result } = renderHook(() => useUpdateShowResultsPrivacy(), { wrapper });

    await act(() => result.current.mutateAsync({ showId: 'show-2', resultsPrivate: false }));

    expect(upsertCalls).toHaveBeenCalledWith(
      expect.objectContaining({ show_id: 'show-2', results_private: false, preset: 'standard' })
    );
  });

  it('does not write when the read of the existing timings fails', async () => {
    readResult.mockReturnValue({
      error: { message: 'permission denied', code: '42501' },
      status: 403,
    });
    const { result } = renderHook(() => useUpdateShowResultsPrivacy(), { wrapper });

    await expect(
      act(() => result.current.mutateAsync({ showId: 'show-3', resultsPrivate: true }))
    ).rejects.toBeTruthy();
    expect(upsertCalls).not.toHaveBeenCalled();
  });
});

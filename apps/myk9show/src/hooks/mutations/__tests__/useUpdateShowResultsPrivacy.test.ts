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
const updateCalls = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      upsert: (payload: unknown) => {
        upsertCalls(payload);
        return { abortSignal: () => Promise.resolve({ error: null, status: 201 }) };
      },
      update: (payload: unknown) => {
        updateCalls(payload);
        return {
          eq: () => ({ abortSignal: () => Promise.resolve({ error: null, status: 204 }) }),
        };
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
    updateCalls.mockReset();
    readResult.mockReset();
  });

  // Review finding (MYK9-969): re-sending timings read a moment ago would
  // overwrite a preset save still in flight. An existing row gets ONLY the
  // privacy column.
  it('updates only results_private on an existing row, never the timings', async () => {
    readResult.mockReturnValue({ data: { show_id: 'show-1' }, error: null, status: 200 });
    const { result } = renderHook(() => useUpdateShowResultsPrivacy(), { wrapper });

    await act(() => result.current.mutateAsync({ showId: 'show-1', resultsPrivate: true }));

    expect(upsertCalls).not.toHaveBeenCalled();
    expect(updateCalls).toHaveBeenCalledTimes(1);
    const payload = updateCalls.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ results_private: true, updated_by: 'user-1' });
    for (const column of [
      'preset',
      'placement_timing',
      'qualification_timing',
      'time_timing',
      'faults_timing',
      'self_checkin_enabled',
    ]) {
      expect(payload).not.toHaveProperty(column);
    }
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

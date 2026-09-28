import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertMock = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: () => ({ upsert: upsertMock }) },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn() },
}));

import { useBulkUpdateClassOverrides, useUpdateTrialOverride } from '../useShowSettingsMutations';
import { resetServerReachabilityForTests, useServerReachable } from '@/lib/serverReachability';

function renderWithClient<T>(hook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(hook, { wrapper });
}

const transportFailure = {
  error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' },
  status: 0,
};
const rlsRejection = {
  error: { message: 'permission denied', details: '', hint: '', code: '42501' },
  status: 403,
};

describe('settings writes and server reachability (MYK9-864)', () => {
  beforeEach(() => {
    upsertMock.mockReset();
    resetServerReachabilityForTests();
  });

  it('marks the server unreachable when a write never reaches Supabase', async () => {
    upsertMock.mockResolvedValue(transportFailure);
    const { result } = renderWithClient(() => ({
      mutation: useUpdateTrialOverride(),
      reachable: useServerReachable(),
    }));

    await act(async () => {
      await expect(
        result.current.mutation.mutateAsync({ trialId: 't1', showId: 's1', preset: 'standard' })
      ).rejects.toMatchObject({ message: 'TypeError: Failed to fetch' });
    });

    expect(result.current.reachable).toBe(false);
  });

  it('leaves reachability alone when the server answered with an error', async () => {
    upsertMock.mockResolvedValue(rlsRejection);
    const { result } = renderWithClient(() => ({
      mutation: useBulkUpdateClassOverrides(),
      reachable: useServerReachable(),
    }));

    await act(async () => {
      await expect(
        result.current.mutation.mutateAsync({ classIds: ['c1'], showId: 's1', preset: 'standard' })
      ).rejects.toMatchObject({ code: '42501' });
    });

    expect(result.current.reachable).toBe(true);
  });

  it('succeeds without touching reachability when the write goes through', async () => {
    upsertMock.mockResolvedValue({ error: null, status: 201 });
    const { result } = renderWithClient(() => ({
      mutation: useUpdateTrialOverride(),
      reachable: useServerReachable(),
    }));

    await act(async () => {
      await result.current.mutation.mutateAsync({
        trialId: 't1',
        showId: 's1',
        preset: 'standard',
      });
    });

    expect(result.current.reachable).toBe(true);
  });
});

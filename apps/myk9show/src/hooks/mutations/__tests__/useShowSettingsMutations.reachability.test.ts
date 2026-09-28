import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error: unknown; status: number };

const upsertResult = vi.fn<() => Result>();
const readResult = vi.fn<() => Result>();
const upsertSignal = vi.fn();
const upsertCalls = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      upsert: (payload: unknown) => {
        upsertCalls(payload);
        return {
          abortSignal: (signal: AbortSignal) => {
            upsertSignal(signal);
            return Promise.resolve(upsertResult());
          },
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

vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn() },
}));

import {
  useBulkUpdateClassOverrides,
  useResetOverride,
  useUpdateClassOverride,
  useUpdateShowCheckin,
  useUpdateShowVisibility,
  useUpdateTrialOverride,
} from '../useShowSettingsMutations';
import { resetServerReachabilityForTests, useServerReachable } from '@/lib/serverReachability';

const transportFailure: Result = {
  error: { message: 'AbortError: signal timed out', details: '', hint: '', code: '' },
  status: 0,
};
const rlsRejection: Result = {
  error: { message: 'permission denied', details: '', hint: '', code: '42501' },
  status: 403,
};

type AnyMutation = { mutateAsync: (vars: never) => Promise<unknown> };

const HOOKS: Array<[string, () => AnyMutation, unknown]> = [
  [
    'useUpdateShowVisibility',
    useUpdateShowVisibility,
    {
      showId: 's1',
      preset: 'standard',
      placementTiming: 'class_complete',
      qualificationTiming: 'immediate',
      timeTiming: 'class_complete',
      faultsTiming: 'class_complete',
    },
  ],
  ['useUpdateShowCheckin', useUpdateShowCheckin, { showId: 's1', enabled: true }],
  ['useUpdateTrialOverride', useUpdateTrialOverride, { trialId: 't1', showId: 's1' }],
  [
    'useUpdateClassOverride',
    useUpdateClassOverride,
    { classId: 'c1', trialId: 't1', showId: 's1' },
  ],
  [
    'useBulkUpdateClassOverrides',
    useBulkUpdateClassOverrides,
    { classIds: ['c1'], showId: 's1', preset: 'standard' },
  ],
  ['useResetOverride', useResetOverride, { entityId: 't1', showId: 's1', level: 'trial' }],
];

function renderMutation(useHook: () => AnyMutation) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  const view = renderHook(() => ({ mutation: useHook(), reachable: useServerReachable() }), {
    wrapper,
  });
  return { ...view, invalidate };
}

async function run(result: { current: { mutation: AnyMutation } }, vars: unknown) {
  let error: unknown = null;
  await act(async () => {
    await result.current.mutation.mutateAsync(vars as never).catch(err => {
      error = err;
    });
  });
  return error;
}

describe('settings writes and server reachability (MYK9-864)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readResult.mockReturnValue({ data: null, error: null, status: 200 });
    resetServerReachabilityForTests();
  });

  it.each(HOOKS)(
    '%s marks the server unreachable on a transport failure',
    async (_, useHook, vars) => {
      upsertResult.mockReturnValue(transportFailure);
      const { result, invalidate } = renderMutation(useHook);

      expect(await run(result, vars)).toMatchObject({ message: 'AbortError: signal timed out' });
      expect(result.current.reachable).toBe(false);
      // No refetch over the same dead link: it would replace the settings card with its
      // error state (MYK9-865).
      expect(invalidate).not.toHaveBeenCalled();
    }
  );

  it.each(HOOKS)(
    '%s leaves reachability alone when the server answered',
    async (_, useHook, vars) => {
      upsertResult.mockReturnValue(rlsRejection);
      const { result } = renderMutation(useHook);

      expect(await run(result, vars)).toMatchObject({ code: '42501' });
      expect(result.current.reachable).toBe(true);
    }
  );

  it.each(HOOKS)('%s bounds the request with a timeout signal', async (_, useHook, vars) => {
    upsertResult.mockReturnValue({ error: null, status: 201 });
    const { result } = renderMutation(useHook);

    expect(await run(result, vars)).toBeNull();
    expect(upsertSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(result.current.reachable).toBe(true);
  });

  it('useUpdateShowCheckin does not overwrite the timings when its read fails', async () => {
    readResult.mockReturnValue({ data: null, ...transportFailure });
    upsertResult.mockReturnValue({ error: null, status: 201 });
    const { result } = renderMutation(useUpdateShowCheckin);

    expect(await run(result, { showId: 's1', enabled: true })).toMatchObject({
      message: 'AbortError: signal timed out',
    });
    expect(upsertCalls).not.toHaveBeenCalled();
    expect(result.current.reachable).toBe(false);
  });

  it.each(HOOKS.slice(0, 2))(
    '%s still refetches when the server answered with an error',
    async (_, useHook, vars) => {
      upsertResult.mockReturnValue(rlsRejection);
      const { result, invalidate } = renderMutation(useHook);

      expect(await run(result, vars)).toMatchObject({ code: '42501' });
      expect(invalidate).toHaveBeenCalled();
    }
  );
});

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queryClient';

const mocks = vi.hoisted(() => {
  const source = () => ({
    getAll: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn(() => vi.fn()),
  });
  return {
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    entries: source(),
    classes: source(),
    trials: source(),
    shows: source(),
  };
});

const authState = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: mocks.rpc },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: authState.user }),
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: mocks.entries,
  replicatedClassesTable: mocks.classes,
  replicatedTrialsTable: mocks.trials,
  replicatedShowsTable: mocks.shows,
}));

import { accountTodayEntriesQueryKey, useAccountTodayEntries } from './accountTodayEntries';

describe('useAccountTodayEntries', () => {
  beforeEach(() => {
    queryClient.clear();
    authState.user = { id: 'user-1' };
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    vi.clearAllMocks();
  });

  it('shares the initial RPC and non-emitting subscriptions across duplicate consumers', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { unmount } = renderHook(
      () => {
        useAccountTodayEntries();
        useAccountTodayEntries();
      },
      { wrapper }
    );

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce());
    expect(mocks.rpc).toHaveBeenCalledWith('get_account_today_entries');
    for (const source of [mocks.entries, mocks.classes, mocks.trials, mocks.shows]) {
      expect(source.subscribe).toHaveBeenCalledOnce();
      expect(source.subscribe).toHaveBeenCalledWith(expect.any(Function), {
        emitCurrent: false,
      });
    }

    unmount();
    for (const source of [mocks.entries, mocks.classes, mocks.trials, mocks.shows]) {
      expect(vi.mocked(source.subscribe).mock.results[0]?.value).toHaveBeenCalledOnce();
    }
  });

  it('rejects previous account data on the production client during switch and sign-out', async () => {
    const accountAEntries = [{ showId: 'show-a' }];
    queryClient.setQueryData(accountTodayEntriesQueryKey('user-1'), accountAEntries);
    let resolveB!: (value: { data: never[]; error: null }) => void;
    mocks.rpc.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveB = resolve as (value: { data: never[]; error: null }) => void;
        })
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(() => useAccountTodayEntries(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(accountAEntries));

    authState.user = { id: 'user-2' };
    rerender();
    expect(result.current.data).toBeUndefined();

    authState.user = null;
    rerender();
    expect(result.current.data).toBeUndefined();

    resolveB({ data: [], error: null });
  });
});

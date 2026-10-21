import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@/test/utils/testUtils';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const source = () => ({
    getAll: vi.fn().mockResolvedValue([]),
    get getAllOrThrow() {
      return this.getAll;
    },
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

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: mocks.rpc },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: mocks.entries,
  replicatedClassesTable: mocks.classes,
  replicatedTrialsTable: mocks.trials,
  replicatedShowsTable: mocks.shows,
}));

import { invalidateAccountTodayEntries, useAccountTodayEntries } from './accountTodayEntries';

describe('useAccountTodayEntries', () => {
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

  it('refetches within 30 s of a replica write, once for a burst, and again for a later write', async () => {
    mocks.rpc.mockClear();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const writes: Array<() => void> = [];
    for (const source of [mocks.entries, mocks.classes, mocks.trials, mocks.shows]) {
      source.subscribe.mockImplementation(((cb: () => void) => {
        writes.push(cb);
        return vi.fn();
      }) as never);
    }
    const { result, unmount } = renderHook(() => useAccountTodayEntries(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    try {
      for (const write of writes) {
        write();
        await vi.advanceTimersByTimeAsync(400);
      }
      await vi.advanceTimersByTimeAsync(28_000);
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(mocks.rpc).toHaveBeenCalledTimes(2);

      writes[0]?.();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mocks.rpc).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
    unmount();
  });

  it('refetches immediately when the own-entry helper invalidates, with no replica write', async () => {
    mocks.rpc.mockClear();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(() => useAccountTodayEntries(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    await act(async () => {
      await invalidateAccountTodayEntries(queryClient, 'user-1');
    });
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    unmount();
  });
});

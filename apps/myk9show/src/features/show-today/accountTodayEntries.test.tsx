import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@/test/utils/testUtils';
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

import { useAccountTodayEntries } from './accountTodayEntries';

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

  it('answers one sync burst spread across ~1.2 s with one RPC, and a later write with one more', async () => {
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
    const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const { result, unmount } = renderHook(() => useAccountTodayEntries(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    for (const write of writes) {
      write();
      await pause(400);
    }
    await pause(1700);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);

    writes[0]?.();
    await pause(1700);
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    unmount();
  }, 15_000);
});

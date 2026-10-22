import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  SHOW_ENTRY_COUNTS_REFRESH_MS,
  showEntryCountsQueryKey,
  useShowEntryCounts,
} from './useShowEntryCounts';
import { NetworkStatusContext } from '@/hooks/useNetworkStatus';
import { supabase } from '@/lib/supabase-client';

vi.mock('@/lib/supabase-client', () => ({
  supabase: { rpc: vi.fn() },
}));

function makeWrapper(isOnline: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const network = {
    isOnline,
    quality: null,
    showOfflineMessage: !isOnline,
    retryConnection: vi.fn(),
  };
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NetworkStatusContext.Provider value={network}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </NetworkStatusContext.Provider>
    );
  };
}

describe('useShowEntryCounts', () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockReset();
  });

  it('maps each RPC row to its own show id, including a real 0', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [
        { show_id: 'show-a', entry_count: 5 },
        { show_id: 'show-b', entry_count: 0 },
      ],
      error: null,
    } as never);

    const { result } = renderHook(() => useShowEntryCounts(['show-b', 'show-a']), {
      wrapper: makeWrapper(true),
    });

    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get('show-a')).toBe(5);
    expect(result.current.get('show-b')).toBe(0);
    expect(supabase.rpc).toHaveBeenCalledWith('get_show_entry_counts', {
      p_show_ids: ['show-b', 'show-a'],
    });
  });

  it('knows nothing about a show the server returned no row for', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ show_id: 'show-a', entry_count: 5 }],
      error: null,
    } as never);

    const { result } = renderHook(() => useShowEntryCounts(['show-a', 'show-other']), {
      wrapper: makeWrapper(true),
    });

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.has('show-other')).toBe(false);
  });

  it('stays empty while loading', () => {
    vi.mocked(supabase.rpc).mockReturnValue(new Promise(() => {}) as never);
    const { result } = renderHook(() => useShowEntryCounts(['show-a']), {
      wrapper: makeWrapper(true),
    });
    expect(result.current.size).toBe(0);
  });

  it('stays empty when the RPC errors', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    } as never);
    const { result } = renderHook(() => useShowEntryCounts(['show-a']), {
      wrapper: makeWrapper(true),
    });
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
  });

  it('does not call the server offline and reports nothing', () => {
    const { result } = renderHook(() => useShowEntryCounts(['show-a']), {
      wrapper: makeWrapper(false),
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it('does not call the server when there are no shows', () => {
    renderHook(() => useShowEntryCounts([]), { wrapper: makeWrapper(true) });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('useShowEntryCounts refresh (MYK9-1311 review)', () => {
  it('keeps its Map cache out of the entries root that row-array updaters rewrite', () => {
    expect(showEntryCountsQueryKey(['show-a'])[0]).not.toBe('entries');
  });

  it('refreshes itself on an interval while mounted, whatever path brought the entries', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({
        data: [{ show_id: 'show-a', entry_count: 5 }],
        error: null,
      } as never)
      .mockResolvedValueOnce({
        data: [{ show_id: 'show-a', entry_count: 6 }],
        error: null,
      } as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const network = {
      isOnline: true,
      quality: null,
      showOfflineMessage: false,
      retryConnection: vi.fn(),
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NetworkStatusContext.Provider value={network}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </NetworkStatusContext.Provider>
    );

    const { result } = renderHook(() => useShowEntryCounts(['show-a']), { wrapper });
    await waitFor(() => expect(result.current.get('show-a')).toBe(5));

    await vi.advanceTimersByTimeAsync(SHOW_ENTRY_COUNTS_REFRESH_MS + 10);

    await waitFor(() => expect(result.current.get('show-a')).toBe(6));
    vi.useRealTimers();
  });

  it('hides a cached count once a later refresh fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({
        data: [{ show_id: 'show-a', entry_count: 5 }],
        error: null,
      } as never)
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } } as never);
    const { result } = renderHook(() => useShowEntryCounts(['show-a']), {
      wrapper: makeWrapper(true),
    });
    await waitFor(() => expect(result.current.get('show-a')).toBe(5));

    await vi.advanceTimersByTimeAsync(SHOW_ENTRY_COUNTS_REFRESH_MS + 10);

    await waitFor(() => expect(result.current.has('show-a')).toBe(false));
    vi.useRealTimers();
  });
});

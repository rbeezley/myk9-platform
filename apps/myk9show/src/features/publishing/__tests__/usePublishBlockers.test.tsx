import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act } from '@testing-library/react';
import { useShowStore } from '@/store/showStore';
import type { Show } from '@/types/show-types';
import {
  PUBLISH_BLOCKERS_DEADLINE_MS,
  useClubPublishBlockers,
  usePublishBlockers,
} from '../usePublishBlockers';

const { rpc, online } = vi.hoisted(() => ({ rpc: vi.fn(), online: { value: true } }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => online.value }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('usePublishBlockers (MYK9-2198)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    online.value = true;
  });

  it('returns the server lines for the show', async () => {
    rpc.mockResolvedValue({
      data: [{ key: 'premium_not_published', waiting_on: 'secretary', eta: null }],
      error: null,
    });
    const { result } = renderHook(() => usePublishBlockers('show-1'), { wrapper });

    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(rpc).toHaveBeenCalledWith('show_publish_blockers', { p_show_id: 'show-1' });
    expect(result.current).toEqual({
      state: 'ready',
      blockers: [{ key: 'premium_not_published', waitingOn: 'secretary', eta: null }],
    });
  });

  it('returns an empty ready list when nothing blocks', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => usePublishBlockers('show-1'), { wrapper });

    await waitFor(() => expect(result.current).toEqual({ state: 'ready', blockers: [] }));
  });

  it('is an error state, never an empty list, when the call fails or offline', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('Failed to fetch') });
    const { result } = renderHook(() => usePublishBlockers('show-1'), { wrapper });

    await waitFor(() => expect(result.current.state).toBe('failed'));
    expect(result.current.blockers).toEqual([]);
  });

  it('retry asks the server again', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    const { result } = renderHook(() => usePublishBlockers('show-1'), { wrapper });
    await waitFor(() => expect(result.current.state).toBe('failed'));

    rpc.mockResolvedValueOnce({ data: [], error: null });
    if (result.current.state === 'failed') result.current.retry();
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('asks again when a show field the list depends on changes locally', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const base = {
      id: 'show-1',
      clubId: 'club-1',
      status: 'draft',
      entryOpenDate: '',
      entryCloseDate: '',
    } as unknown as Show;
    act(() => useShowStore.setState({ shows: [base] }));
    const { result } = renderHook(() => usePublishBlockers('show-1'), { wrapper });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(rpc).toHaveBeenCalledTimes(1);

    act(() =>
      useShowStore.setState({
        shows: [{ ...base, entryOpenDate: '2026-06-01', publishesOwnPremium: true } as Show],
      })
    );
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    act(() => useShowStore.setState({ shows: [] }));
  });

  it('reads failed, not ready, when a refresh fails after an earlier success', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const sharedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => usePublishBlockers('show-1'), { wrapper: sharedWrapper });
    await waitFor(() => expect(result.current.state).toBe('ready'));

    rpc.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    await act(async () => {
      await client.refetchQueries({ queryKey: ['shows', 'show-1', 'publish-blockers'] });
    });
    await waitFor(() => expect(result.current.state).toBe('failed'));
    expect(result.current.blockers).toEqual([]);
  });

  it('reads offline, not ready, when the device is offline', () => {
    online.value = false;
    const { result } = renderHook(() => usePublishBlockers('show-1'), { wrapper });
    expect(result.current).toEqual({ state: 'offline', blockers: [] });
  });

  it('is checking while the first answer is pending', () => {
    rpc.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePublishBlockers('show-1'), { wrapper });
    expect(result.current).toEqual({ state: 'checking', blockers: [] });
  });

  it('a stalled call becomes failed within the deadline, for both reads', async () => {
    vi.useFakeTimers();
    try {
      rpc.mockReturnValue(new Promise(() => {}));
      const show = renderHook(() => usePublishBlockers('show-1'), { wrapper });
      const club = renderHook(() => useClubPublishBlockers('club-1'), { wrapper });
      expect(show.result.current.state).toBe('checking');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PUBLISH_BLOCKERS_DEADLINE_MS + 100);
      });
      expect(show.result.current.state).toBe('failed');
      expect(club.result.current.state).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('expiry aborts the underlying request, for both reads', async () => {
    vi.useFakeTimers();
    try {
      const signals: AbortSignal[] = [];
      rpc.mockImplementation(() => {
        const call = {
          abortSignal(signal: AbortSignal) {
            signals.push(signal);
            return new Promise(() => {});
          },
          then(resolve: (value: unknown) => unknown) {
            return new Promise(() => {}).then(resolve);
          },
        };
        return call;
      });
      renderHook(() => usePublishBlockers('show-1'), { wrapper });
      renderHook(() => useClubPublishBlockers('club-1'), { wrapper });
      expect(signals).toHaveLength(2);
      expect(signals.every(signal => !signal.aborted)).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PUBLISH_BLOCKERS_DEADLINE_MS + 100);
      });
      expect(signals.every(signal => signal.aborted)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not ask when disabled', () => {
    renderHook(() => usePublishBlockers('show-1', false), { wrapper });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reads the club lines from the club RPC', async () => {
    rpc.mockResolvedValue({
      data: [{ key: 'club_not_approved', waiting_on: 'myk9', eta: 'about a day' }],
      error: null,
    });
    const { result } = renderHook(() => useClubPublishBlockers('club-1'), { wrapper });

    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(rpc).toHaveBeenCalledWith('club_publish_blockers', { p_club_id: 'club-1' });
  });
});

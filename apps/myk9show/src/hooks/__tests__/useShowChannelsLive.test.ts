import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import {
  subscribeToShowChanges,
  type ShowChangeStatus,
  type ShowChangeStatusListener,
} from '@/features/show-live-sync/showChangeSignal';
import { useShowChannelsLive } from '../useShowChannelsLive';

const state = vi.hoisted(() => ({ online: true }));

vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: vi.fn(),
}));
vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => state.online }));

const listeners = new Map<string, ShowChangeStatusListener>();
const unsubscribe = vi.fn();

function report(showId: string, status: ShowChangeStatus) {
  act(() => listeners.get(showId)?.(status));
}

describe('useShowChannelsLive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    state.online = true;
    vi.mocked(subscribeToShowChanges).mockImplementation((showId, _listener, status) => {
      if (status) listeners.set(showId, status);
      return unsubscribe;
    });
  });

  it('is false until every show reports SUBSCRIBED', () => {
    const ids = ['a', 'b'];
    const { result } = renderHook(() => useShowChannelsLive(ids));
    expect(result.current).toBe(false);

    report('a', 'SUBSCRIBED');
    expect(result.current).toBe(false);

    report('b', 'SUBSCRIBED');
    expect(result.current).toBe(true);
  });

  it.each(['CLOSED', 'TIMED_OUT', 'CHANNEL_ERROR'] as const)('drops to false on %s', status => {
    const ids = ['a'];
    const { result } = renderHook(() => useShowChannelsLive(ids));
    report('a', 'SUBSCRIBED');
    expect(result.current).toBe(true);

    report('a', status);
    expect(result.current).toBe(false);
  });

  it('is false while offline even when subscribed', () => {
    const ids = ['a'];
    const { result, rerender } = renderHook(() => useShowChannelsLive(ids));
    report('a', 'SUBSCRIBED');
    expect(result.current).toBe(true);

    state.online = false;
    rerender();
    expect(result.current).toBe(false);
  });

  it('is false with no shows and unsubscribes on unmount', () => {
    const empty: string[] = [];
    expect(renderHook(() => useShowChannelsLive(empty)).result.current).toBe(false);

    const ids = ['a'];
    renderHook(() => useShowChannelsLive(ids)).unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('forgets statuses when the show list changes', () => {
    let ids = ['a'];
    const { result, rerender } = renderHook(() => useShowChannelsLive(ids));
    report('a', 'SUBSCRIBED');
    expect(result.current).toBe(true);

    ids = ['a', 'b'];
    rerender();
    expect(result.current).toBe(false);
  });
});

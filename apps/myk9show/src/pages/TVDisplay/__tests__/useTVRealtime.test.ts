import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  subscribeToShowChanges,
  type ShowChangeListener,
  type ShowChangeStatusListener,
} from '@/features/show-live-sync/showChangeSignal';
import { useTVRealtime } from '../useTVRealtime';

vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: vi.fn(),
}));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    Wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children),
    qc,
  };
}

describe('useTVRealtime', () => {
  let changeHandler: ShowChangeListener | undefined;
  let statusHandler: ShowChangeStatusListener | undefined;
  let unsubscribe: ReturnType<typeof subscribeToShowChanges>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    changeHandler = undefined;
    statusHandler = undefined;
    unsubscribe = vi.fn();
    vi.mocked(subscribeToShowChanges).mockImplementation((_showId, onChange, onStatus) => {
      changeHandler = onChange;
      statusHandler = onStatus;
      return unsubscribe;
    });
  });

  afterEach(() => vi.useRealTimers());

  it('subscribes through the shared show channel and invalidates on a signal', () => {
    const { Wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useTVRealtime('show-1'), { wrapper: Wrapper });

    expect(subscribeToShowChanges).toHaveBeenCalledWith(
      'show-1',
      expect.any(Function),
      expect.any(Function)
    );
    act(() => changeHandler?.({ table: 'entries' }));
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it('reports connected when subscribed and polls after a channel error', () => {
    const { Wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useTVRealtime('show-1'), { wrapper: Wrapper });

    act(() => statusHandler?.('SUBSCRIBED'));
    expect(result.current.isConnected).toBe(true);

    invalidate.mockClear();
    act(() => {
      statusHandler?.('CHANNEL_ERROR');
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.isConnected).toBe(false);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes on unmount', () => {
    const { Wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useTVRealtime('show-1'), { wrapper: Wrapper });
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('does nothing when showId is empty', () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useTVRealtime(''), { wrapper: Wrapper });
    expect(subscribeToShowChanges).not.toHaveBeenCalled();
  });
});

import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@/test/utils/testUtils';

const mocks = vi.hoisted(() => ({
  fetchInputs: vi.fn(),
  listener: null as null | (() => void),
  statusListener: null as null | ((status: string) => void),
  unsubscribe: vi.fn(),
}));

vi.mock('./nationalsLeaderboardInputs', async () => {
  const actual = await vi.importActual<typeof import('./nationalsLeaderboardInputs')>(
    './nationalsLeaderboardInputs'
  );
  return { ...actual, fetchNationalsLeaderboardInputs: mocks.fetchInputs };
});
vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: vi.fn(
    (_showId: string, listener: () => void, statusListener?: (status: string) => void) => {
      mocks.listener = listener;
      mocks.statusListener = statusListener ?? null;
      return mocks.unsubscribe;
    }
  ),
}));

import { useNationalsLeaderboardInputs } from './useNationalsLeaderboardInputs';

function createTestWrapper() {
  const client = createTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mocks.fetchInputs.mockReset().mockResolvedValue([]);
  mocks.unsubscribe.mockReset();
  mocks.listener = null;
  mocks.statusListener = null;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useNationalsLeaderboardInputs', () => {
  it('refetches once, debounced, when the show changes while the board is open', async () => {
    const { unmount } = renderHook(() => useNationalsLeaderboardInputs('show-1', true), {
      wrapper: createTestWrapper(),
    });
    await waitFor(() => expect(mocks.fetchInputs).toHaveBeenCalledTimes(1));
    expect(mocks.listener).not.toBeNull();

    vi.useFakeTimers();
    act(() => {
      mocks.listener?.();
      mocks.listener?.();
      mocks.listener?.();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    vi.useRealTimers();
    await waitFor(() => expect(mocks.fetchInputs).toHaveBeenCalledTimes(2));

    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalled();
  });

  it('re-reads whenever the live channel joins and says so while it is down', async () => {
    const { result } = renderHook(() => useNationalsLeaderboardInputs('show-1', true), {
      wrapper: createTestWrapper(),
    });
    await waitFor(() => expect(mocks.fetchInputs).toHaveBeenCalledTimes(1));

    // The first join re-reads too: anything that changed before the channel joined was missed.
    act(() => mocks.statusListener?.('SUBSCRIBED'));
    expect(result.current.liveDown).toBe(false);
    await waitFor(() => expect(mocks.fetchInputs).toHaveBeenCalledTimes(2));

    act(() => mocks.statusListener?.('CHANNEL_ERROR'));
    expect(result.current.liveDown).toBe(true);

    act(() => mocks.statusListener?.('SUBSCRIBED'));
    expect(result.current.liveDown).toBe(false);
    await waitFor(() => expect(mocks.fetchInputs).toHaveBeenCalledTimes(3));
  });

  it('neither reads nor subscribes while disabled', () => {
    renderHook(() => useNationalsLeaderboardInputs('show-1', false), {
      wrapper: createTestWrapper(),
    });
    expect(mocks.fetchInputs).not.toHaveBeenCalled();
    expect(mocks.listener).toBeNull();
  });
});

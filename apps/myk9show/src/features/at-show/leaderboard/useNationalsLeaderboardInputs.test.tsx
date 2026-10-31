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
import type { NationalsLeaderboardInputRow } from './nationalsLeaderboardInputs';

function createTestWrapper() {
  const client = createTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const row = (entryId: string): NationalsLeaderboardInputRow => ({
  entry_id: entryId,
  class_id: 'c1',
  dog_id: `dog-${entryId}`,
  dog_name: 'Dog',
  dog_call_name: 'Dog',
  armband: '101',
  handler_name: 'Handler',
  entry_status: 'confirmed',
  check_in_status: null,
  is_scored: true,
  result_status: 'qualified',
  points_earned: 1,
  search_time_seconds: 1,
  class_results_released_at: '2026-11-01T12:00:00Z',
  trial_date: '2026-11-01',
  show_start_date: '2026-11-01',
});

/** A read the test settles by hand, so an event can land while it is in flight. */
function deferredRead() {
  let resolve!: (rows: NationalsLeaderboardInputRow[]) => void;
  const promise = new Promise<NationalsLeaderboardInputRow[]>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

const settle = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

function mount() {
  return renderHook(() => useNationalsLeaderboardInputs('show-1', true), {
    wrapper: createTestWrapper(),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.fetchInputs.mockReset().mockResolvedValue([row('first')]);
  mocks.unsubscribe.mockReset();
  mocks.listener = null;
  mocks.statusListener = null;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useNationalsLeaderboardInputs', () => {
  it('reads once on mount and subscribes to the show', async () => {
    const { result } = mount();
    await settle(0);
    expect(mocks.fetchInputs).toHaveBeenCalledTimes(1);
    expect(result.current.inputs?.entries.map(e => e.id)).toEqual(['first']);
    expect(mocks.listener).not.toBeNull();
  });

  it('collapses a burst of changes into one debounced re-read', async () => {
    mount();
    await settle(0);
    act(() => {
      mocks.listener?.();
      mocks.listener?.();
      mocks.listener?.();
    });
    await settle(1000);
    expect(mocks.fetchInputs).toHaveBeenCalledTimes(1);
    await settle(1000);
    expect(mocks.fetchInputs).toHaveBeenCalledTimes(2);
  });

  it('re-reads a change that lands during the first read instead of serving the stale one', async () => {
    const first = deferredRead();
    mocks.fetchInputs
      .mockReset()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue([row('fresh')]);
    const { result } = mount();
    await settle(0);
    expect(mocks.fetchInputs).toHaveBeenCalledTimes(1);

    act(() => mocks.listener?.());
    await act(async () => {
      first.resolve([row('stale')]);
      await vi.advanceTimersByTimeAsync(0);
    });
    // The stale answer is discarded; the read goes round again after the settle pause.
    expect(result.current.inputs).toBeNull();
    await settle(1000);
    expect(mocks.fetchInputs).toHaveBeenCalledTimes(2);
    expect(result.current.inputs?.entries.map(e => e.id)).toEqual(['fresh']);
  });

  it('re-reads when the channel joins during the first read', async () => {
    const first = deferredRead();
    mocks.fetchInputs
      .mockReset()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue([row('fresh')]);
    const { result } = mount();
    await settle(0);

    act(() => mocks.statusListener?.('SUBSCRIBED'));
    await act(async () => {
      first.resolve([row('stale')]);
      await vi.advanceTimersByTimeAsync(0);
    });
    await settle(1000);
    expect(result.current.inputs?.entries.map(e => e.id)).toEqual(['fresh']);
  });

  it('re-reads on a join after an idle first read, and says so while the channel is down', async () => {
    const { result } = mount();
    await settle(0);
    expect(mocks.fetchInputs).toHaveBeenCalledTimes(1);

    act(() => mocks.statusListener?.('SUBSCRIBED'));
    expect(result.current.liveDown).toBe(false);
    await settle(2000);
    expect(mocks.fetchInputs).toHaveBeenCalledTimes(2);

    act(() => mocks.statusListener?.('CHANNEL_ERROR'));
    expect(result.current.liveDown).toBe(true);

    act(() => mocks.statusListener?.('SUBSCRIBED'));
    expect(result.current.liveDown).toBe(false);
    await settle(2000);
    expect(mocks.fetchInputs).toHaveBeenCalledTimes(3);
  });

  it('unsubscribes on unmount', async () => {
    const { unmount } = mount();
    await settle(0);
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalled();
  });

  it('neither reads nor subscribes while disabled', async () => {
    renderHook(() => useNationalsLeaderboardInputs('show-1', false), {
      wrapper: createTestWrapper(),
    });
    await settle(0);
    expect(mocks.fetchInputs).not.toHaveBeenCalled();
    expect(mocks.listener).toBeNull();
  });
});

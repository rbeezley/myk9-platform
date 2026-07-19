import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { features } from '@/config/features';
import {
  subscribeToShowChanges,
  type ShowChangeListener,
  type ShowChangeStatusListener,
} from '@/features/show-live-sync/showChangeSignal';
import { showLiveSyncEnabled, useShowLiveSync } from '@/features/show-live-sync/useShowLiveSync';

vi.mock('@/config/features', () => ({ features: { showLiveSync: true } }));
vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: vi.fn(),
}));

const SYNC_EVENT = 'replication:sync-requested';
let changeListener: ShowChangeListener | undefined;
let statusListener: ShowChangeStatusListener | undefined;
let unsubscribe: ReturnType<typeof subscribeToShowChanges>;
let dispatchSpy: ReturnType<typeof vi.spyOn>;

const emitChange = () => changeListener?.({ table: 'entries' });
const dispatchedSyncEvents = () =>
  (dispatchSpy.mock.calls as Array<[Event]>).filter(([event]) => event.type === SYNC_EVENT);

const setFlag = (enabled: boolean) => {
  (features as { showLiveSync: boolean }).showLiveSync = enabled;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  setFlag(true);
  unsubscribe = vi.fn();
  changeListener = undefined;
  statusListener = undefined;
  vi.mocked(subscribeToShowChanges).mockImplementation((_showId, onChange, onStatus) => {
    changeListener = onChange;
    statusListener = onStatus;
    return unsubscribe;
  });
  dispatchSpy = vi.spyOn(window, 'dispatchEvent');
});

afterEach(() => {
  dispatchSpy.mockRestore();
  vi.useRealTimers();
});

describe('showLiveSyncEnabled', () => {
  it('reflects the feature flag', () => {
    setFlag(false);
    expect(showLiveSyncEnabled()).toBe(false);
    setFlag(true);
    expect(showLiveSyncEnabled()).toBe(true);
  });
});

describe('useShowLiveSync', () => {
  it('registers one show-scoped change consumer', () => {
    renderHook(() => useShowLiveSync('show-1'));

    expect(subscribeToShowChanges).toHaveBeenCalledWith(
      'show-1',
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('opens no subscription when disabled or missing a show', () => {
    setFlag(false);
    renderHook(() => useShowLiveSync('show-1'));
    renderHook(() => useShowLiveSync(undefined));

    expect(subscribeToShowChanges).not.toHaveBeenCalled();
  });

  it('collapses a burst into one bare replication nudge', () => {
    renderHook(() => useShowLiveSync('show-1'));

    act(() => {
      emitChange();
      emitChange();
      emitChange();
      vi.advanceTimersByTime(400);
    });

    const syncEvents = dispatchedSyncEvents().map(([event]) => event);
    expect(syncEvents).toHaveLength(1);
    expect((syncEvents[0] as CustomEvent).detail).toBeUndefined();
  });

  it('nudges on reconnect but not the initial connection', () => {
    renderHook(() => useShowLiveSync('show-1'));

    act(() => {
      statusListener?.('SUBSCRIBED');
      vi.advanceTimersByTime(400);
    });
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: SYNC_EVENT }));

    act(() => {
      statusListener?.('SUBSCRIBED');
      vi.advanceTimersByTime(400);
    });
    expect(dispatchedSyncEvents()).toHaveLength(1);
  });

  it('unsubscribes and clears a pending nudge on unmount', () => {
    const { unmount } = renderHook(() => useShowLiveSync('show-1'));
    act(emitChange);
    unmount();
    act(() => vi.advanceTimersByTime(400));

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(dispatchedSyncEvents()).toHaveLength(0);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { markRealtimeReconnected } from '@myk9/replication';
import { features } from '@/config/features';
import {
  subscribeToShowChanges,
  type ShowChangeListener,
  type ShowChangeSignal,
  type ShowChangeTable,
  type ShowChangeStatusListener,
} from '@/features/show-live-sync/showChangeSignal';
import {
  clearShowChannel,
  markShowChannel,
  registerShowChannelMount,
} from '@/providers/syncCadence';
import { replicatedClassesTable, replicatedTrialsTable } from '@/services/replication';
import { resetShowNudgeGate, setShowNudgeRandom } from '@/features/show-live-sync/showNudgeGate';
import { showLiveSyncEnabled, useShowLiveSync } from '@/features/show-live-sync/useShowLiveSync';

vi.mock('@myk9/replication', () => ({ markRealtimeReconnected: vi.fn() }));
vi.mock('@/config/features', () => ({
  features: { showLiveSync: true, replicationScopedNudges: false },
}));
vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: { getTrialsByShow: vi.fn() },
  replicatedClassesTable: { getClassById: vi.fn() },
}));
vi.mock('@/providers/syncCadence', () => ({
  registerShowChannelMount: vi.fn((showId: string) => `${showId}#token`),
  markShowChannel: vi.fn(),
  clearShowChannel: vi.fn(),
}));
vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: vi.fn(),
}));

const SYNC_EVENT = 'replication:sync-requested';
let changeListener: ShowChangeListener | undefined;
let statusListener: ShowChangeStatusListener | undefined;
let unsubscribe: ReturnType<typeof subscribeToShowChanges>;
let dispatchSpy: ReturnType<typeof vi.spyOn>;

const emitChange = (table: ShowChangeTable = 'entries', extra: Partial<ShowChangeSignal> = {}) =>
  changeListener?.({ table, ...extra });
const dispatchedSyncEvents = () =>
  (dispatchSpy.mock.calls as Array<[Event]>).filter(([event]) => event.type === SYNC_EVENT);

const setFlag = (enabled: boolean) => {
  (features as { showLiveSync: boolean }).showLiveSync = enabled;
};

const setScoped = (enabled: boolean) => {
  (features as { replicationScopedNudges: boolean }).replicationScopedNudges = enabled;
};

beforeEach(() => {
  vi.useFakeTimers();
  resetShowNudgeGate();
  setShowNudgeRandom(() => 0);
  setScoped(false);
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
  resetShowNudgeGate();
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

  it('nudges on reconnect, deferred, but not the initial connection', () => {
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
    const events = dispatchedSyncEvents().map(([event]) => event as CustomEvent);
    expect(events).toHaveLength(1);
    // A reconnect must not demand an immediate full pass (MYK9-1054).
    expect(events[0]?.detail).toEqual({ deferred: true });
  });

  it('keeps the prompt pass when a change lands in the same window as a reconnect', () => {
    renderHook(() => useShowLiveSync('show-1'));
    act(() => {
      statusListener?.('SUBSCRIBED');
    });

    act(() => {
      emitChange();
      statusListener?.('SUBSCRIBED');
      vi.advanceTimersByTime(400);
    });

    const events = dispatchedSyncEvents().map(([event]) => event as CustomEvent);
    expect(events).toHaveLength(1);
    expect(events[0]?.detail).toBeUndefined();
  });

  it('marks a realtime reconnect on a re-subscribe, even when a change coalesces it (MYK9-1301)', () => {
    renderHook(() => useShowLiveSync('show-1'));
    act(() => {
      statusListener?.('SUBSCRIBED');
    });
    expect(markRealtimeReconnected).not.toHaveBeenCalled();

    act(() => {
      emitChange();
      statusListener?.('SUBSCRIBED');
      vi.advanceTimersByTime(400);
    });

    expect(markRealtimeReconnected).toHaveBeenCalledOnce();
  });

  it('unsubscribes and clears a pending nudge on unmount', () => {
    const { unmount } = renderHook(() => useShowLiveSync('show-1'));
    act(() => emitChange());
    unmount();
    act(() => vi.advanceTimersByTime(400));

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(dispatchedSyncEvents()).toHaveLength(0);
  });

  it('marks the show subscribed or not from the channel status and clears it on unmount (MYK9-1305)', () => {
    const { unmount } = renderHook(() => useShowLiveSync('show-1'));

    act(() => {
      statusListener?.('SUBSCRIBED');
    });
    expect(markShowChannel).toHaveBeenLastCalledWith('show-1#token', true);

    act(() => {
      statusListener?.('CLOSED');
    });
    expect(markShowChannel).toHaveBeenLastCalledWith('show-1#token', false);

    unmount();
    expect(clearShowChannel).toHaveBeenCalledWith('show-1#token');
    expect(registerShowChannelMount).toHaveBeenCalledWith('show-1');
  });
});

describe('useShowLiveSync scoped change nudges (MYK9-1304)', () => {
  const GAP_MS = 5_000;
  const eventDetails = () => dispatchedSyncEvents().map(([event]) => (event as CustomEvent).detail);

  beforeEach(() => {
    setScoped(true);
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue({ id: 'c' } as never);
    vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
      { id: 'trial-1' },
      { id: 'trial-2' },
    ] as never);
  });

  it('an entries change dispatches one scoped entries target for the show', async () => {
    renderHook(() => useShowLiveSync('show-1'));
    await act(async () => {
      emitChange('entries');
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(eventDetails()).toEqual([{ targets: [{ name: 'entries', scopeId: 'show-1' }] }]);
  });

  it('a classes change dispatches one classes target per trial of the show', async () => {
    renderHook(() => useShowLiveSync('show-1'));
    await act(async () => {
      emitChange('classes');
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(replicatedTrialsTable.getTrialsByShow).toHaveBeenCalledWith('show-1');
    expect(eventDetails()).toEqual([
      {
        targets: [
          { name: 'classes', scopeId: 'trial-1' },
          { name: 'classes', scopeId: 'trial-2' },
        ],
      },
    ]);
  });

  it('a paperwork_prints change is scoped by show id', async () => {
    renderHook(() => useShowLiveSync('show-1'));
    await act(async () => {
      emitChange('paperwork_prints');
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(eventDetails()).toEqual([
      { targets: [{ name: 'paperwork_prints', scopeId: 'show-1' }] },
    ]);
  });

  it('a classes change with no trials in the replica falls back to a bare full nudge', async () => {
    vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([]);
    renderHook(() => useShowLiveSync('show-1'));
    await act(async () => {
      emitChange('classes');
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(eventDetails()).toEqual([undefined]);
  });

  it('a burst inside the gap becomes one pass carrying the union of targets', async () => {
    renderHook(() => useShowLiveSync('show-1'));
    await act(async () => {
      emitChange('entries');
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      emitChange('entries');
      emitChange('paperwork_prints');
      await vi.advanceTimersByTimeAsync(GAP_MS);
    });

    expect(eventDetails()).toEqual([
      { targets: [{ name: 'entries', scopeId: 'show-1' }] },
      {
        targets: [
          { name: 'entries', scopeId: 'show-1' },
          { name: 'paperwork_prints', scopeId: 'show-1' },
        ],
      },
    ]);
  });

  it('a reconcile envelope (signal.id) is a bare full pass, not a scoped one', async () => {
    renderHook(() => useShowLiveSync('show-1'));
    await act(async () => {
      emitChange('classes', { id: 'class-9' });
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(eventDetails()).toEqual([undefined]);
    expect(replicatedTrialsTable.getTrialsByShow).not.toHaveBeenCalled();
  });

  it('a classes signal naming a class absent from the replica is a bare full pass', async () => {
    vi.mocked(replicatedClassesTable.getClassById).mockImplementation((async (id: string) =>
      id === 'known' ? { id } : null) as never);
    renderHook(() => useShowLiveSync('show-1'));
    await act(async () => {
      emitChange('classes', { classIds: ['known', 'brand-new'] });
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(eventDetails()).toEqual([undefined]);
  });

  it('a classes signal whose classes are all local stays scoped', async () => {
    renderHook(() => useShowLiveSync('show-1'));
    await act(async () => {
      emitChange('classes', { classIds: ['c1', 'c2'] });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(eventDetails()).toEqual([
      {
        targets: [
          { name: 'classes', scopeId: 'trial-1' },
          { name: 'classes', scopeId: 'trial-2' },
        ],
      },
    ]);
  });

  it('flag off: a change is the bare event after the 400 ms debounce', () => {
    setScoped(false);
    renderHook(() => useShowLiveSync('show-1'));
    act(() => {
      emitChange('entries');
      vi.advanceTimersByTime(400);
    });

    expect(eventDetails()).toEqual([undefined]);
    expect(replicatedTrialsTable.getTrialsByShow).not.toHaveBeenCalled();
  });

  it('the reconnect nudge stays deferred and unscoped with the flag on', async () => {
    renderHook(() => useShowLiveSync('show-1'));
    await act(async () => {
      statusListener?.('SUBSCRIBED');
      statusListener?.('SUBSCRIBED');
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(eventDetails()).toEqual([{ deferred: true }]);
  });

  it('a pending scoped nudge still fires once after unmount, and a later broadcast schedules nothing', async () => {
    const { unmount } = renderHook(() => useShowLiveSync('show-1'));
    act(() => emitChange('entries'));
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GAP_MS * 2);
    });
    expect(eventDetails()).toEqual([{ targets: [{ name: 'entries', scopeId: 'show-1' }] }]);

    // Unsubscribed: the real unsubscribe removes the listener, so nothing new is
    // scheduled. The gate has no pending state left either.
    expect(unsubscribe).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GAP_MS * 2);
    });
    expect(dispatchedSyncEvents()).toHaveLength(1);
  });

  it('one of two mounts for a show unmounting keeps the pending nudge', async () => {
    const first = renderHook(() => useShowLiveSync('show-1'));
    renderHook(() => useShowLiveSync('show-1'));
    act(() => emitChange('entries'));
    first.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GAP_MS);
    });

    expect(dispatchedSyncEvents()).toHaveLength(1);
  });
});

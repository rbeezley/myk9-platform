import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { ShowChangeStatus } from './showChangeSignal';
import { resetShowNudgeGate, setShowNudgeRandom } from './showNudgeGate';
import { markOnline, resetSyncCadence } from '@/providers/syncCadence';
import { replicatedTrialsTable } from '@/services/replication';

const mocks = vi.hoisted(() => ({
  statusListener: undefined as ((status: string) => void) | undefined,
  signalListener: undefined as ((signal: { table: string }) => void) | undefined,
}));

vi.mock('./showChangeSignal', () => ({
  subscribeToShowChanges: (
    _showId: string,
    onSignal: (signal: { table: string }) => void,
    onStatus: (status: ShowChangeStatus) => void
  ) => {
    mocks.signalListener = onSignal;
    mocks.statusListener = onStatus as (status: string) => void;
    return () => undefined;
  },
}));
vi.mock('@myk9/replication', async importOriginal => ({
  SYNC_INTERVAL_MS: (await importOriginal<typeof import('@myk9/replication')>()).SYNC_INTERVAL_MS,
  markRealtimeReconnected: vi.fn(),
}));
vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: { getTrialsByShow: vi.fn().mockResolvedValue([{ id: 'trial-1' }]) },
  replicatedClassesTable: { getClassById: vi.fn().mockResolvedValue({ id: 'class-1' }) },
}));

import {
  resetShowFallbackPollRandom,
  SHOW_FALLBACK_POLL_DOWN_MS,
  SHOW_FALLBACK_POLL_SUBSCRIBED_MS,
  setShowFallbackPollRandom,
} from './showFallbackPoll';
import { useShowLiveSync } from './useShowLiveSync';

let visibility: MockInstance | undefined;
const requested: CustomEvent[] = [];
const onRequest = (event: Event) => requested.push(event as CustomEvent);
const flush = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
};
// The timer armed at mount is the 60 s one (the channel is not yet known to be up) and a later
// status only re-arms EARLIER, so a subscribed hook spends one 60 s tick before the slow cadence.
const spendMountTick = async () => {
  await flush(SHOW_FALLBACK_POLL_DOWN_MS + 8_000);
  requested.length = 0;
};
const bareRequests = () => requested.filter(event => !event.detail?.targets);
const entriesTargets = () =>
  requested.flatMap(event => event.detail?.targets ?? []).filter(t => t.name === 'entries');

beforeEach(() => {
  vi.useFakeTimers();
  requested.length = 0;
  mocks.statusListener = undefined;
  mocks.signalListener = undefined;
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([{ id: 'trial-1' }] as never);
  setShowFallbackPollRandom(() => 0);
  resetShowNudgeGate();
  resetSyncCadence();
  setShowNudgeRandom(() => 0);
  window.addEventListener('replication:sync-requested', onRequest);
});

afterEach(() => {
  window.removeEventListener('replication:sync-requested', onRequest);
  resetShowNudgeGate();
  resetShowFallbackPollRandom();
  visibility?.mockRestore();
  visibility = undefined;
  vi.useRealTimers();
});

// MYK9-1923: the app-level poll has no show scope, so it never syncs a show's entries. When the
// broadcast does not arrive, only this hook's own scoped poll can refresh the Show Desk card.
describe('useShowLiveSync fallback poll', () => {
  it('syncs the show scoped entries on a poll while the channel is down', async () => {
    renderHook(() => useShowLiveSync('show-1'));
    mocks.statusListener?.('CHANNEL_ERROR');
    await flush(SHOW_FALLBACK_POLL_DOWN_MS + 4_000);
    expect(entriesTargets()).toContainEqual({ name: 'entries', scopeId: 'show-1' });
  });

  it('also syncs the show classes so the schedule status line follows', async () => {
    renderHook(() => useShowLiveSync('show-1'));
    mocks.statusListener?.('CHANNEL_ERROR');
    await flush(SHOW_FALLBACK_POLL_DOWN_MS + 4_000);
    const names = requested.flatMap(event => event.detail?.targets ?? []).map(t => t.name);
    expect(names).toContain('classes');
  });

  it('holds the slower safety-net interval while the channel is subscribed', async () => {
    renderHook(() => useShowLiveSync('show-1'));
    mocks.statusListener?.('SUBSCRIBED');
    await spendMountTick();
    await flush(SHOW_FALLBACK_POLL_DOWN_MS + 4_000);
    expect(entriesTargets()).toHaveLength(0);
    await flush(SHOW_FALLBACK_POLL_SUBSCRIBED_MS);
    expect(entriesTargets().length).toBeGreaterThan(0);
  });

  it('does not poll a hidden tab', async () => {
    visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    renderHook(() => useShowLiveSync('show-1'));
    mocks.statusListener?.('CHANNEL_ERROR');
    await flush(SHOW_FALLBACK_POLL_DOWN_MS * 3);
    expect(entriesTargets()).toHaveLength(0);
  });

  it('stops polling after unmount', async () => {
    const { unmount } = renderHook(() => useShowLiveSync('show-1'));
    mocks.statusListener?.('CHANNEL_ERROR');
    unmount();
    await flush(SHOW_FALLBACK_POLL_SUBSCRIBED_MS * 2);
    expect(entriesTargets()).toHaveLength(0);
  });

  it('re-arms to the 60 s interval when a subscribed channel drops', async () => {
    renderHook(() => useShowLiveSync('show-1'));
    mocks.statusListener?.('SUBSCRIBED');
    await spendMountTick();
    await flush(SHOW_FALLBACK_POLL_DOWN_MS + 4_000);
    expect(entriesTargets()).toHaveLength(0);
    mocks.statusListener?.('CHANNEL_ERROR');
    await flush(SHOW_FALLBACK_POLL_DOWN_MS + 4_000);
    expect(entriesTargets().length).toBeGreaterThan(0);
  });

  it('keeps the pending timer when a status flaps faster than the interval', async () => {
    renderHook(() => useShowLiveSync('show-1'));
    mocks.statusListener?.('CHANNEL_ERROR');
    for (let i = 0; i < 8; i += 1) {
      await flush(10_000);
      mocks.statusListener?.(i % 2 ? 'CHANNEL_ERROR' : 'SUBSCRIBED');
    }
    await flush(SHOW_FALLBACK_POLL_DOWN_MS);
    expect(entriesTargets().length).toBeGreaterThan(0);
  });

  it('pins the subscribed delay to the 180-300 s window', async () => {
    // The mount tick fires at 60 s and re-arms: lower edge 180 s later, upper edge 300 s later.
    for (const [random, delayMs] of [
      [0, 180_000],
      [0.999999, 300_000],
    ] as const) {
      requested.length = 0;
      resetShowNudgeGate();
      setShowNudgeRandom(() => 0);
      setShowFallbackPollRandom(() => random);
      const { unmount } = renderHook(() => useShowLiveSync('show-1'));
      mocks.statusListener?.('SUBSCRIBED');
      await flush(SHOW_FALLBACK_POLL_DOWN_MS + 1_000);
      requested.length = 0;
      await flush(delayMs - 3_000);
      expect(entriesTargets()).toHaveLength(0);
      await flush(3_000 + 4_000);
      expect(entriesTargets().length).toBeGreaterThan(0);
      unmount();
    }
  });

  it('does not tick while the device is offline, then polls once back online', async () => {
    markOnline(false);
    renderHook(() => useShowLiveSync('show-1'));
    mocks.statusListener?.('CHANNEL_ERROR');
    await flush(SHOW_FALLBACK_POLL_DOWN_MS * 3);
    expect(requested).toHaveLength(0);
    markOnline(true);
    await flush(SHOW_FALLBACK_POLL_DOWN_MS + 4_000);
    expect(entriesTargets().length).toBeGreaterThan(0);
  });

  it('uses the 60 s interval while subscribed when the cadence kill switch is off', async () => {
    const { features } = await import('@/config/features');
    const before = features.replicationSubscribedCadence;
    Object.assign(features, { replicationSubscribedCadence: false });
    try {
      renderHook(() => useShowLiveSync('show-1'));
      mocks.statusListener?.('SUBSCRIBED');
      await flush(SHOW_FALLBACK_POLL_DOWN_MS + 4_000);
      expect(entriesTargets().length).toBeGreaterThan(0);
    } finally {
      Object.assign(features, { replicationSubscribedCadence: before });
    }
  });

  it('still requests the entries pass when the replica has no trials', async () => {
    vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([]);
    renderHook(() => useShowLiveSync('show-1'));
    mocks.statusListener?.('CHANNEL_ERROR');
    await flush(SHOW_FALLBACK_POLL_DOWN_MS + 4_000);
    expect(entriesTargets()).toContainEqual({ name: 'entries', scopeId: 'show-1' });
    expect(requested.flatMap(event => event.detail?.targets ?? []).map(t => t.name)).not.toContain(
      'classes'
    );
    expect(bareRequests()).toHaveLength(1);
  });

  it('keeps a pending broadcast fallback when a poll tick coalesces with it', async () => {
    vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([]);
    renderHook(() => useShowLiveSync('show-1'));
    mocks.statusListener?.('CHANNEL_ERROR');
    await flush(SHOW_FALLBACK_POLL_DOWN_MS - 1_000);
    mocks.signalListener?.({ table: 'classes' });
    await flush(1_000 + 8_000);
    expect(bareRequests().length).toBeGreaterThan(0);
    expect(entriesTargets().length).toBeGreaterThan(0);
  });
});

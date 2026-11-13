import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShowChangeStatus } from './showChangeSignal';
import { resetShowNudgeGate, setShowNudgeRandom } from './showNudgeGate';
import { resetSyncCadence } from '@/providers/syncCadence';

const mocks = vi.hoisted(() => ({
  statusListener: undefined as ((status: string) => void) | undefined,
}));

vi.mock('./showChangeSignal', () => ({
  subscribeToShowChanges: (
    _showId: string,
    _onSignal: unknown,
    onStatus: (status: ShowChangeStatus) => void
  ) => {
    mocks.statusListener = onStatus as (status: string) => void;
    return () => undefined;
  },
}));
vi.mock('@myk9/replication', () => ({ markRealtimeReconnected: vi.fn() }));
vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: { getTrialsByShow: vi.fn().mockResolvedValue([{ id: 'trial-1' }]) },
  replicatedClassesTable: { getClassById: vi.fn().mockResolvedValue({ id: 'class-1' }) },
}));

import { SHOW_FALLBACK_POLL_DOWN_MS, SHOW_FALLBACK_POLL_SUBSCRIBED_MS } from './showFallbackPoll';
import { useShowLiveSync } from './useShowLiveSync';

const requested: CustomEvent[] = [];
const onRequest = (event: Event) => requested.push(event as CustomEvent);
const flush = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
};
const entriesTargets = () =>
  requested.flatMap(event => event.detail?.targets ?? []).filter(t => t.name === 'entries');

beforeEach(() => {
  vi.useFakeTimers();
  requested.length = 0;
  mocks.statusListener = undefined;
  resetShowNudgeGate();
  resetSyncCadence();
  setShowNudgeRandom(() => 0);
  window.addEventListener('replication:sync-requested', onRequest);
});

afterEach(() => {
  window.removeEventListener('replication:sync-requested', onRequest);
  resetShowNudgeGate();
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
    await flush(SHOW_FALLBACK_POLL_DOWN_MS + 4_000);
    expect(entriesTargets()).toHaveLength(0);
    await flush(SHOW_FALLBACK_POLL_SUBSCRIBED_MS);
    expect(entriesTargets().length).toBeGreaterThan(0);
  });

  it('does not poll a hidden tab', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    renderHook(() => useShowLiveSync('show-1'));
    mocks.statusListener?.('CHANNEL_ERROR');
    await flush(SHOW_FALLBACK_POLL_DOWN_MS * 3);
    expect(entriesTargets()).toHaveLength(0);
    visibility.mockRestore();
  });

  it('stops polling after unmount', async () => {
    const { unmount } = renderHook(() => useShowLiveSync('show-1'));
    mocks.statusListener?.('CHANNEL_ERROR');
    unmount();
    await flush(SHOW_FALLBACK_POLL_SUBSCRIBED_MS * 2);
    expect(entriesTargets()).toHaveLength(0);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/services/replication/MutationQueueManager', () => ({
  mutationQueue: {
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@myk9/scoring-ui', () => ({
  haptic: {
    light: vi.fn(),
    success: vi.fn(),
    medium: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { useOfflineQueueStore, type QueuedScore } from '../offlineQueueStore';

const baseScore: Omit<QueuedScore, 'id' | 'timestamp' | 'retryCount' | 'maxRetries' | 'status'> = {
  entryId: 42,
  armband: 101,
  classId: 7,
  className: 'Novice A',
  licenseKey: 'test-license-key',
  scoreData: {
    resultText: 'Q',
    searchTime: '0:42.10',
  },
};

const resetStore = () => {
  useOfflineQueueStore.setState({
    queue: [],
    failedItems: [],
    isOnline: true,
    isSyncing: false,
    lastSyncAttempt: null,
  });
};

describe('offlineQueueStore — sync flag invariants', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStore();
  });

  it('does not leave isSyncing latched true after addToQueue while online', async () => {
    // INTENT: addToQueue used to schedule setTimeout(startSync, 100), which
    // flipped isSyncing=true with no corresponding clear in the steady-state
    // online path (only syncManager.processOfflineQueue calls syncComplete,
    // and it only runs on offline→online transitions). This regression test
    // pins the contract: after queueing a score while already online, the
    // store must not be left in a "syncing" state that blocks future work.

    await useOfflineQueueStore.getState().addToQueue(baseScore);

    // Drain any pending timers (the historical bug fired startSync ~100ms later).
    await vi.advanceTimersByTimeAsync(500);

    expect(useOfflineQueueStore.getState().isSyncing).toBe(false);
  });

  it('a second addToQueue is not blocked by stale isSyncing from the first', async () => {
    // INTENT: even if the first addToQueue somehow flips isSyncing, a second
    // addToQueue + its eventual sync trigger must not silently no-op because
    // of a stuck flag. The user-visible symptom of the wedge was: "my second
    // score doesn't sync." Pin that the queue keeps the pending item ready
    // for the processor to pick up.

    await useOfflineQueueStore.getState().addToQueue(baseScore);
    await vi.advanceTimersByTimeAsync(500);

    await useOfflineQueueStore.getState().addToQueue({ ...baseScore, entryId: 43 });
    await vi.advanceTimersByTimeAsync(500);

    const state = useOfflineQueueStore.getState();
    expect(state.queue).toHaveLength(2);
    expect(state.queue.every(item => item.status === 'pending')).toBe(true);
    expect(state.isSyncing).toBe(false);
  });
});

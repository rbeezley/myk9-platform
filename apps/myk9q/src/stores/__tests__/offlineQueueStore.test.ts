/**
 * Tests for offlineQueueStore retry semantics.
 *
 * Regression suite for the bug where markAsFailed transitioned items to
 * status='failed' even on non-terminal failures, but getNextItemToSync only
 * matched status='pending' — stranding scores after the first retry failure.
 * The fix: keep items 'pending' with a retryAt gate until max retries are
 * exhausted, then move to failedItems.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useOfflineQueueStore } from '../offlineQueueStore';
import { mutationQueue } from '@/services/replication/MutationQueueManager';
import { baseScore, resetOfflineQueueStore } from './offlineQueueTestUtils';

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
  },
}));

describe('offlineQueueStore — retry state machine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetOfflineQueueStore();
  });

  describe('addToQueue', () => {
    it('initializes retryAt to null so the item is immediately eligible', async () => {
      await useOfflineQueueStore.getState().addToQueue(baseScore);
      const [item] = useOfflineQueueStore.getState().queue;
      expect(item.status).toBe('pending');
      expect(item.retryAt).toBeNull();
      expect(item.retryCount).toBe(0);
    });
  });

  describe('markAsFailed — non-terminal failure', () => {
    it('keeps item pending and gates it behind retryAt instead of stranding it as "failed"', async () => {
      await useOfflineQueueStore.getState().addToQueue(baseScore);
      const id = useOfflineQueueStore.getState().queue[0].id;

      const before = Date.now();
      useOfflineQueueStore.getState().markAsFailed(id, 'first failure');
      const after = Date.now();

      const item = useOfflineQueueStore.getState().queue.find(q => q.id === id);
      expect(item).toBeDefined();
      expect(item!.status).toBe('pending');
      expect(item!.retryCount).toBe(1);
      expect(item!.lastError).toBe('first failure');
      // Backoff for retry #1 is ~1000ms (2^0 * 1000)
      expect(item!.retryAt).not.toBeNull();
      expect(item!.retryAt!).toBeGreaterThanOrEqual(before + 1000);
      expect(item!.retryAt!).toBeLessThanOrEqual(after + 1000);

      // Failed bucket stays empty until retries are exhausted
      expect(useOfflineQueueStore.getState().failedItems).toHaveLength(0);
    });

    it('applies exponential backoff across successive failures (1s → 2s)', async () => {
      await useOfflineQueueStore.getState().addToQueue(baseScore);
      const id = useOfflineQueueStore.getState().queue[0].id;

      useOfflineQueueStore.getState().markAsFailed(id, 'err 1');
      const retryAt1 = useOfflineQueueStore.getState().queue[0].retryAt!;
      const baseline1 = Date.now();

      useOfflineQueueStore.getState().markAsFailed(id, 'err 2');
      const retryAt2 = useOfflineQueueStore.getState().queue[0].retryAt!;
      const baseline2 = Date.now();

      // retry #1 → ~1s, retry #2 → ~2s. Use baselines to avoid wall-clock flake.
      expect(retryAt1 - baseline1).toBeGreaterThanOrEqual(900);
      expect(retryAt1 - baseline1).toBeLessThanOrEqual(1100);
      expect(retryAt2 - baseline2).toBeGreaterThanOrEqual(1900);
      expect(retryAt2 - baseline2).toBeLessThanOrEqual(2100);
    });
  });

  describe('markAsFailed — terminal failure', () => {
    it('moves item to failedItems once max retries are exhausted', async () => {
      await useOfflineQueueStore.getState().addToQueue(baseScore);
      const id = useOfflineQueueStore.getState().queue[0].id;

      // maxRetries is 3 (set in addToQueue). Three failures push retryCount to 3.
      useOfflineQueueStore.getState().markAsFailed(id, 'err 1');
      useOfflineQueueStore.getState().markAsFailed(id, 'err 2');
      useOfflineQueueStore.getState().markAsFailed(id, 'err 3');

      expect(useOfflineQueueStore.getState().queue).toHaveLength(0);
      const failed = useOfflineQueueStore.getState().failedItems;
      expect(failed).toHaveLength(1);
      expect(failed[0].id).toBe(id);
      expect(failed[0].status).toBe('failed');
      expect(failed[0].retryCount).toBe(3);
      expect(failed[0].lastError).toBe('err 3');
    });
  });

  describe('getNextItemToSync', () => {
    it('returns items whose retryAt is null (freshly enqueued)', async () => {
      await useOfflineQueueStore.getState().addToQueue(baseScore);
      const next = useOfflineQueueStore.getState().getNextItemToSync();
      expect(next).not.toBeNull();
      expect(next!.retryAt).toBeNull();
    });

    it('skips items whose retryAt is in the future', async () => {
      await useOfflineQueueStore.getState().addToQueue(baseScore);
      const id = useOfflineQueueStore.getState().queue[0].id;
      // Force a backoff window
      useOfflineQueueStore.getState().markAsFailed(id, 'err');

      const next = useOfflineQueueStore.getState().getNextItemToSync();
      expect(next).toBeNull();
    });

    it('returns items whose retryAt is in the past', async () => {
      await useOfflineQueueStore.getState().addToQueue(baseScore);
      const id = useOfflineQueueStore.getState().queue[0].id;
      useOfflineQueueStore.getState().markAsFailed(id, 'err');

      // Backdate retryAt to simulate elapsed backoff
      useOfflineQueueStore.getState().updateQueueItem(id, {
        retryAt: Date.now() - 1,
      });

      const next = useOfflineQueueStore.getState().getNextItemToSync();
      expect(next).not.toBeNull();
      expect(next!.id).toBe(id);
    });

    it('picks an eligible item over a gated item earlier in the queue', async () => {
      await useOfflineQueueStore.getState().addToQueue(baseScore);
      await useOfflineQueueStore
        .getState()
        .addToQueue({ ...baseScore, entryId: 102 });

      // Gate the first item; second stays eligible
      const firstId = useOfflineQueueStore.getState().queue[0].id;
      useOfflineQueueStore.getState().markAsFailed(firstId, 'err');

      const next = useOfflineQueueStore.getState().getNextItemToSync();
      expect(next).not.toBeNull();
      expect(next!.entryId).toBe(102);
    });
  });

  describe('getNextRetryAt', () => {
    it('returns null when no items are gated', async () => {
      await useOfflineQueueStore.getState().addToQueue(baseScore);
      expect(useOfflineQueueStore.getState().getNextRetryAt()).toBeNull();
    });

    it('returns the earliest gated retryAt', async () => {
      await useOfflineQueueStore.getState().addToQueue(baseScore);
      await useOfflineQueueStore
        .getState()
        .addToQueue({ ...baseScore, entryId: 102 });

      const [a, b] = useOfflineQueueStore.getState().queue;
      // Item A → retryCount=2 → ~2s backoff; B → retryCount=1 → ~1s backoff
      useOfflineQueueStore.getState().markAsFailed(a.id, 'e');
      useOfflineQueueStore.getState().markAsFailed(a.id, 'e'); // now ~2s
      useOfflineQueueStore.getState().markAsFailed(b.id, 'e'); // ~1s

      const earliest = useOfflineQueueStore.getState().getNextRetryAt();
      const bRetryAt = useOfflineQueueStore
        .getState()
        .queue.find(q => q.id === b.id)!.retryAt!;
      expect(earliest).toBe(bRetryAt);
    });
  });

  describe('retryFailed', () => {
    it('moves failedItems back to queue with retryAt cleared and retryCount reset', async () => {
      await useOfflineQueueStore.getState().addToQueue(baseScore);
      const id = useOfflineQueueStore.getState().queue[0].id;
      // Exhaust retries
      useOfflineQueueStore.getState().markAsFailed(id, 'e');
      useOfflineQueueStore.getState().markAsFailed(id, 'e');
      useOfflineQueueStore.getState().markAsFailed(id, 'e');
      expect(useOfflineQueueStore.getState().failedItems).toHaveLength(1);

      useOfflineQueueStore.getState().retryFailed();

      const queue = useOfflineQueueStore.getState().queue;
      expect(queue).toHaveLength(1);
      expect(queue[0].status).toBe('pending');
      expect(queue[0].retryCount).toBe(0);
      expect(queue[0].retryAt).toBeNull();
      expect(useOfflineQueueStore.getState().failedItems).toHaveLength(0);
    });
  });
});

describe('offlineQueueStore — integration with mutationQueue persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetOfflineQueueStore();
  });

  it('persists initial enqueue to IndexedDB', async () => {
    await useOfflineQueueStore.getState().addToQueue(baseScore);
    expect(mutationQueue.set).toHaveBeenCalledTimes(1);
    expect(mutationQueue.set).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SUBMIT_SCORE',
        status: 'pending',
        data: expect.objectContaining({ entryId: 101 }),
      })
    );
  });

  it('removes from IndexedDB on markAsCompleted', async () => {
    await useOfflineQueueStore.getState().addToQueue(baseScore);
    const id = useOfflineQueueStore.getState().queue[0].id;
    await useOfflineQueueStore.getState().markAsCompleted(id);
    expect(mutationQueue.delete).toHaveBeenCalledWith(id);
    expect(useOfflineQueueStore.getState().queue).toHaveLength(0);
  });
});

describe('offlineQueueStore — sync flag invariants (addToQueue)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetOfflineQueueStore();
  });

  it('does not leave isSyncing latched true after addToQueue while online', async () => {
    // INTENT: addToQueue used to schedule setTimeout(startSync, 100), which
    // flipped isSyncing=true with no corresponding clear in the steady-state
    // online path (only syncManager.processOfflineQueue calls syncComplete,
    // and it only runs on offline→online transitions). This pins the
    // contract: queueing a score while already online must not leave the
    // store in a "syncing" state that blocks future work. Fake timers stay
    // in place so a re-introduced setTimeout would surface here.
    await useOfflineQueueStore.getState().addToQueue(baseScore);
    await vi.advanceTimersByTimeAsync(500);

    expect(useOfflineQueueStore.getState().isSyncing).toBe(false);
  });

  it('a second addToQueue is not blocked by stale isSyncing from the first', async () => {
    // INTENT: the user-visible symptom of the wedge was "my second score
    // doesn't sync." Pin that the queue keeps both items pending and
    // ready for the processor to pick up, with no latched flag.
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

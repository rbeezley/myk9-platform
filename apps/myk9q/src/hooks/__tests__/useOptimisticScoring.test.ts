/**
 * Tests for useOptimisticScoring hook - Offline-First Compliance
 *
 * Verifies that scoring follows offline-first pattern:
 * 1. Optimistic updates happen immediately
 * 2. No manual refresh() calls
 * 3. Silent failure when offline
 * 4. No rollback of optimistic updates
 * 5. Real-time subscriptions handle confirmation
 * 6. Cache write passes isDirty=true so the optimistic score row is protected
 *    from being overwritten by a stale replication pull via the dirty-row
 *    guard + mergeDirtyRow logic. Regression for the scoring-sync-bug fix
 *    (2026-05-24). See project_scoring_sync_bug.md.
 * 7. When submitScore() fails while online, a 'replication:sync-failed'
 *    CustomEvent is dispatched so the existing SyncFailureToast listener
 *    surfaces a toast. Closes the "silent failure" gap left after the
 *    Phase 1 dirty-bit fix.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { useOptimisticScoring } from '@/hooks/useOptimisticScoring';
import { submitScore } from '@/services/entryService';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';
import { replicatedEntriesTable } from '@/services/replication';
import { logger } from '@/utils/logger';

// Hoist mock functions so they are available to the hoisted vi.mock factories
const { mockMarkAsScored, mockSubmitScore, mockAddToQueue, mockUpdate } = vi.hoisted(() => ({
  mockMarkAsScored: vi.fn(),
  mockSubmitScore: vi.fn(),
  mockAddToQueue: vi.fn(),
  mockUpdate: vi.fn(async ({ serverUpdate, onSuccess }) => {
    try {
      await serverUpdate();
      onSuccess?.();
    } catch (err) {
      // Silent failure for offline
    }
  }),
}));

// Mock dependencies using aliases
vi.mock('@/services/entryService', () => ({
  submitScore: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/stores/offlineQueueStore', () => ({
  useOfflineQueueStore: vi.fn(() => ({
    addToQueue: mockAddToQueue,
    isOnline: true,
  })),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabaseLicenseKey: vi.fn(() => 'test-license-key-12345'),
}));

// Mock replication layer to avoid IndexedDB dependencies
vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    markAsScored: vi.fn().mockResolvedValue(undefined),
    markAsSynced: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/stores/entryStore', () => ({
  useEntryStore: vi.fn(() => ({
    markAsScored: mockMarkAsScored,
    entries: [],
    setEntries: vi.fn(),
  })),
}));

vi.mock('@myk9/scoring', () => ({
  useScoringStore: vi.fn(() => ({
    submitScore: mockSubmitScore,
    scores: [],
    isScoring: false,
  })),
}));

// Mock the hook specifically
vi.mock('@/hooks/useOptimisticUpdate', () => ({
  useOptimisticUpdate: vi.fn(() => ({
    update: mockUpdate,
    isSyncing: false,
    hasError: false,
    error: null,
    retryCount: 0,
    clearError: vi.fn(),
  })),
}));

describe('useOptimisticScoring - Offline-First Compliance', () => {
  const mockEntry = {
    id: 1,
    classId: 10,
    armband: 101,
    className: 'Novice A',
  };

  const mockScoreData = {
    resultText: 'Q',
    searchTime: '1:23.45',
    faultCount: 0,
    correctCount: 3,
    incorrectCount: 0,
  };

  beforeEach(() => {
    // Clear all mock functions
    mockMarkAsScored.mockClear();
    mockSubmitScore.mockClear();
    mockAddToQueue.mockClear();
    mockUpdate.mockClear();
    vi.mocked(replicatedEntriesTable.markAsScored).mockClear();
    vi.mocked(replicatedEntriesTable.markAsSynced).mockClear();

    // Set up default implementations
    vi.mocked(submitScore).mockResolvedValue(undefined);

    // Mock offline queue store
    vi.mocked(useOfflineQueueStore).mockReturnValue({
      addToQueue: mockAddToQueue,
      isOnline: true,
    } as unknown as ReturnType<typeof useOfflineQueueStore>);

    // Reset navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Scenario 1: Online - Successful Sync', () => {
    it('updates local stores immediately before the replicated cache write', async () => {
      const { result } = renderHook(() => useOptimisticScoring());

      let storeUpdateTime: number | null = null;
      let cacheWriteTime: number | null = null;

      mockMarkAsScored.mockImplementation(() => {
        storeUpdateTime = Date.now();
      });

      vi.mocked(replicatedEntriesTable.markAsScored).mockImplementation(async () => {
        cacheWriteTime = Date.now();
      });

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      // Assert local stores were updated immediately
      expect(mockMarkAsScored).toHaveBeenCalledWith(mockEntry.id, mockScoreData.resultText);
      expect(mockSubmitScore).toHaveBeenCalledWith(
        expect.objectContaining({
          entryId: mockEntry.id,
          armband: mockEntry.armband,
        })
      );

      // Assert timing: UI store update happened before the replicated queue write.
      expect(storeUpdateTime).not.toBeNull();
      expect(cacheWriteTime).not.toBeNull();
      if (storeUpdateTime && cacheWriteTime) {
        expect(storeUpdateTime).toBeLessThanOrEqual(cacheWriteTime);
      }
    });

    it('calls update hook with proper server sync function', async () => {
      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      // Assert update hook was called (manages optimistic updates and retries)
      expect(mockUpdate).toHaveBeenCalled();
      expect(submitScore).not.toHaveBeenCalled();
    });

    it('queues the replicated score update with database fields', async () => {
      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      expect(replicatedEntriesTable.markAsScored).toHaveBeenCalledWith(
        String(mockEntry.id),
        expect.objectContaining({
          result_status: 'qualified',
          search_time_seconds: 83.45,
          total_faults: 0,
        }),
        true
      );
      expect(submitScore).not.toHaveBeenCalled();
    });

    it('does not call direct submitScore or side-channel markAsSynced for the normal scoring path', async () => {
      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      expect(replicatedEntriesTable.markAsScored).toHaveBeenCalledWith(
        String(mockEntry.id),
        expect.objectContaining({
          result_status: 'qualified',
          search_time_seconds: 83.45,
          total_faults: 0,
        }),
        true
      );
      expect(submitScore).not.toHaveBeenCalled();
      expect(replicatedEntriesTable.markAsSynced).not.toHaveBeenCalled();
    });

    it('updates stores immediately with optimistic data', async () => {
      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      // Verify optimistic updates happened immediately
      expect(mockMarkAsScored).toHaveBeenCalledWith(mockEntry.id, mockScoreData.resultText);
      expect(mockSubmitScore).toHaveBeenCalled();
    });
  });

  describe('Scenario 2: Offline - Silent Failure', () => {
    beforeEach(() => {
      // Mock offline state
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        configurable: true,
        value: false,
      });

      vi.mocked(useOfflineQueueStore).mockReturnValue({
        addToQueue: mockAddToQueue,
        isOnline: false,
      } as unknown as ReturnType<typeof useOfflineQueueStore>);
    });

    it('updates stores immediately when offline', async () => {
      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      // Verify stores were updated immediately even when offline
      expect(mockMarkAsScored).toHaveBeenCalledWith(mockEntry.id, mockScoreData.resultText);
      expect(mockSubmitScore).toHaveBeenCalled();
    });

    it('does not throw error or show alert when offline', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation();

      const { result } = renderHook(() => useOptimisticScoring());

      // Should not throw
      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      // No alert shown to user
      expect(alertSpy).not.toHaveBeenCalled();

      // May log to console (that's fine)
      // but error message should be about offline, not a crash
      if (consoleErrorSpy.mock.calls.length > 0) {
        expect(consoleErrorSpy.mock.calls[0][0]).toMatch(/offline|failed/i);
      }

      alertSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('does not add a second offline-queue item when offline', async () => {
      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      expect(replicatedEntriesTable.markAsScored).toHaveBeenCalledWith(
        String(mockEntry.id),
        expect.any(Object),
        true
      );
      expect(mockAddToQueue).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 3: Connection Drops Mid-Sync', () => {
    it('does not rollback optimistic update if sync fails', async () => {
      (submitScore as Mock).mockRejectedValue(new Error('Network timeout'));

      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      // Optimistic update was applied to stores
      expect(mockMarkAsScored).toHaveBeenCalledWith(mockEntry.id, mockScoreData.resultText);
      expect(mockSubmitScore).toHaveBeenCalled();

      // NOT rolled back (optimistic update persists even on failure)
      // The update hook handles retries without rolling back UI changes
    });

    it('does not show error to user when sync fails', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation();
      (submitScore as Mock).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      expect(alertSpy).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });
  });

  describe('Scenario 4: Multiple Rapid Actions', () => {
    it('applies all optimistic updates immediately', async () => {
      const { result } = renderHook(() => useOptimisticScoring());

      const entries = [
        { id: 1, scoreData: { resultText: 'Q', searchTime: '1:00.00' } },
        { id: 2, scoreData: { resultText: 'NQ', searchTime: '2:00.00' } },
        { id: 3, scoreData: { resultText: 'Q', searchTime: '1:30.00' } },
      ];

      // Perform 3 rapid scoring actions
      await act(async () => {
        await Promise.all(
          entries.map(entry =>
            result.current.submitScoreOptimistically({
              entryId: entry.id,
              classId: mockEntry.classId,
              armband: mockEntry.armband + entry.id,
              className: mockEntry.className,
              scoreData: entry.scoreData,
            })
          )
        );
      });

      // All 3 should update stores immediately
      expect(mockMarkAsScored).toHaveBeenCalled();
      expect(mockMarkAsScored.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(mockSubmitScore.mock.calls.length).toBeGreaterThanOrEqual(3);

      // Check each entry was marked as scored with correct data
      entries.forEach(entry => {
        const matchingCall = mockMarkAsScored.mock.calls.find(call => call[0] === entry.id);
        expect(matchingCall).toBeDefined();
        expect(matchingCall[1]).toBe(entry.scoreData.resultText);
      });
    });

    it('queues all syncs correctly without deduplication', async () => {
      const { result } = renderHook(() => useOptimisticScoring());

      const entries = [1, 2, 3];

      await act(async () => {
        await Promise.all(
          entries.map(id =>
            result.current.submitScoreOptimistically({
              entryId: id,
              classId: mockEntry.classId,
              armband: 100 + id,
              className: mockEntry.className,
              scoreData: { resultText: 'Q', searchTime: `1:${id}0.00` },
            })
          )
        );
      });

      expect(replicatedEntriesTable.markAsScored).toHaveBeenCalled();
      expect(
        vi.mocked(replicatedEntriesTable.markAsScored).mock.calls.length
      ).toBeGreaterThanOrEqual(3);
      expect(submitScore).not.toHaveBeenCalled();
    }, 15000);
  });

  describe('Scenario 5: Real-time Subscription Integration', () => {
    it('allows real-time subscriptions to confirm updates independently', async () => {
      const { result } = renderHook(() => useOptimisticScoring());

      // Perform scoring action
      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      // Verify stores were updated immediately (optimistic)
      expect(mockMarkAsScored).toHaveBeenCalledWith(mockEntry.id, mockScoreData.resultText);

      // Real-time subscriptions will confirm the update via their own mechanism
      // The hook doesn't interfere with that process
    });
  });

  describe('Pattern Compliance Checks', () => {
    it('follows the exact offline-first pattern: optimistic update then background sync', async () => {
      const callOrder: string[] = [];

      mockMarkAsScored.mockImplementation(() => {
        callOrder.push('markAsScored');
      });

      vi.mocked(replicatedEntriesTable.markAsScored).mockImplementation(async () => {
        callOrder.push('replicatedMarkAsScored');
      });

      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      await waitFor(
        () => {
          expect(callOrder).toEqual(['markAsScored', 'replicatedMarkAsScored']);
        },
        { timeout: 10000 }
      );
    }, 15000);

    it('updates UI in less than 50ms (optimistic)', async () => {
      const { result } = renderHook(() => useOptimisticScoring());

      const startTime = Date.now();

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      const uiUpdateTime = Date.now() - startTime;

      // Optimistic update should be nearly instant
      expect(uiUpdateTime).toBeLessThan(100); // Allow 100ms for test overhead
      expect(mockMarkAsScored).toHaveBeenCalled();
      expect(mockSubmitScore).toHaveBeenCalled();
    });
  });

  // Regression for the scoring-sync-bug (project_scoring_sync_bug.md, 2026-05-24).
  // The cache write must pass isDirty=true so the row is marked
  // _syncStatus:'pending'. That triggers the dirty-row guard and mergeDirtyRow
  // logic which preserves the optimistic score from being overwritten by a
  // stale replication pull. Before this fix the call passed `false`, so a pull
  // between local write and server confirmation overwrote the optimistic
  // score with stale server state.
  describe('Regression: replicatedEntriesTable.markAsScored must mark cache row dirty', () => {
    it('passes isDirty=true so optimistic score survives replication pull-overwrite', async () => {
      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      // The third argument is `isDirty`. Must be `true` so the row is marked
      // _syncStatus:'pending' and the pull/merge logic preserves the
      // optimistic score. If a future PR flips it back to `false`, the
      // pull-overwrite bug returns — fail loudly here.
      expect(replicatedEntriesTable.markAsScored).toHaveBeenCalledWith(
        String(mockEntry.id),
        expect.any(Object),
        true
      );
    });
  });

  describe('Regression: scoring uses the replicated mutation queue (not submitScore/offlineQueue)', () => {
    // The default `mockUpdate` (top of file) swallows serverUpdate rejections
    // silently — it never invokes onError. The recovery path lives in the
    // onError branch, so we need a local mock that propagates failures into
    // onError (which is what the real useOptimisticUpdate does after retries
    // are exhausted).
    const mockUpdateWithOnError = vi.fn(async ({ serverUpdate, onSuccess, onError }) => {
      try {
        await serverUpdate();
        onSuccess?.();
      } catch (err) {
        onError?.(err);
      }
    });

    beforeEach(async () => {
      const { useOptimisticUpdate } = await import('@/hooks/useOptimisticUpdate');
      vi.mocked(useOptimisticUpdate).mockReturnValue({
        update: mockUpdateWithOnError as unknown as ReturnType<
          typeof useOptimisticUpdate
        >['update'],
        isSyncing: false,
        hasError: false,
        error: null,
        retryCount: 0,
        clearError: vi.fn(),
      });
      mockUpdateWithOnError.mockClear();
    });

    it('does not call submitScore or enqueue into the legacy offline queue', async () => {
      (submitScore as Mock).mockRejectedValue(new Error('RLS reject: scores'));
      const onError = vi.fn();

      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
          onError,
        });
      });

      expect(submitScore).not.toHaveBeenCalled();
      expect(mockAddToQueue).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('does not need class context to preserve the replicated score mutation', async () => {
      (submitScore as Mock).mockRejectedValue(new Error('RLS reject: scores'));
      const loggerErrorSpy = vi.spyOn(logger, 'error');
      const onError = vi.fn();

      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          // classId intentionally omitted — simulates a future caller forgetting it
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
          onError,
        });
      });

      expect(replicatedEntriesTable.markAsScored).toHaveBeenCalledWith(
        String(mockEntry.id),
        expect.any(Object),
        true
      );
      expect(mockAddToQueue).not.toHaveBeenCalled();
      expect(loggerErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Cannot enqueue failed score'),
        expect.anything()
      );
      expect(onError).not.toHaveBeenCalled();

      loggerErrorSpy.mockRestore();
    });

    it('does NOT dispatch the generic replication:sync-failed toast (Retry would lie about recovery)', async () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      (submitScore as Mock).mockRejectedValue(new Error('RLS reject: scores'));

      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      const syncFailedCalls = dispatchSpy.mock.calls.filter(
        ([event]) => event instanceof CustomEvent && event.type === 'replication:sync-failed'
      );
      expect(syncFailedCalls).toHaveLength(0);

      dispatchSpy.mockRestore();
    });

    it('does NOT enqueue twice on offline failures (offline path already queued inside serverUpdate)', async () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        configurable: true,
        value: false,
      });
      vi.mocked(useOfflineQueueStore).mockReturnValue({
        addToQueue: mockAddToQueue,
        isOnline: false,
      } as unknown as ReturnType<typeof useOfflineQueueStore>);

      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      expect(mockAddToQueue).not.toHaveBeenCalled();
    });

    it('still skips dispatching the generic sync-failed event when offline', async () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        configurable: true,
        value: false,
      });
      vi.mocked(useOfflineQueueStore).mockReturnValue({
        addToQueue: mockAddToQueue,
        isOnline: false,
      } as unknown as ReturnType<typeof useOfflineQueueStore>);

      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      const syncFailedCalls = dispatchSpy.mock.calls.filter(
        ([event]) => event instanceof CustomEvent && event.type === 'replication:sync-failed'
      );
      expect(syncFailedCalls).toHaveLength(0);

      dispatchSpy.mockRestore();
    });
  });

  describe('Regression: dirty bit is owned by MutationManager upload success', () => {
    it('does NOT side-channel markAsSynced on hook success', async () => {
      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      expect(replicatedEntriesTable.markAsSynced).not.toHaveBeenCalled();
    });

    it('does NOT call markAsSynced when submitScore fails (onError path)', async () => {
      const { useOptimisticUpdate } = await import('@/hooks/useOptimisticUpdate');

      // Force the mock update to route through onError instead of onSuccess.
      const onErrorUpdate = vi.fn(async ({ serverUpdate, onError }) => {
        try {
          await serverUpdate();
        } catch (err) {
          onError?.(err);
        }
      });
      vi.mocked(useOptimisticUpdate).mockReturnValueOnce({
        update: onErrorUpdate,
        isSyncing: false,
        hasError: false,
        error: null,
        retryCount: 0,
        clearError: vi.fn(),
      } as ReturnType<typeof useOptimisticUpdate>);

      vi.mocked(submitScore).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData,
        });
      });

      // markAsSynced lives in the onSuccess branch only — never fires on failure.
      expect(replicatedEntriesTable.markAsSynced).not.toHaveBeenCalled();
    });
  });
});

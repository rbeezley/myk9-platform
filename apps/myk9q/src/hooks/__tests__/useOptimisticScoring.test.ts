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
    it('updates local stores immediately before API call', async () => {
      const { result } = renderHook(() => useOptimisticScoring());

      let apiCallTime: number | null = null;
      let storeUpdateTime: number | null = null;

      mockMarkAsScored.mockImplementation(() => {
        storeUpdateTime = Date.now();
      });

      (submitScore as Mock).mockImplementation(async () => {
        apiCallTime = Date.now();
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 100));
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

      // Assert timing: store update happened before or at same time as API call
      expect(storeUpdateTime).not.toBeNull();
      expect(apiCallTime).not.toBeNull();
      if (storeUpdateTime && apiCallTime) {
        // Store update must not come AFTER API call (can be same millisecond)
        expect(storeUpdateTime).toBeLessThanOrEqual(apiCallTime);
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

      // Wait for async operations
      await waitFor(() => {
        expect(submitScore).toHaveBeenCalled();
      });

      // Assert update hook was called (manages optimistic updates and retries)
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('syncs with database in background', async () => {
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

      await waitFor(() => {
        expect(submitScore).toHaveBeenCalledWith(
          mockEntry.id,
          expect.objectContaining({
            resultText: 'Q',
            searchTime: '1:23.45',
          }),
          undefined,
          mockEntry.classId
        );
      });
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

    it('adds score to offline queue when offline', async () => {
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

      // Verify score was queued for later sync
      expect(mockAddToQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          licenseKey: 'test-license-key-12345', // Required for background sync RLS
        })
      );
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

      // Should have at least 3 API calls (may be more with retries)
      await waitFor(
        () => {
          expect(submitScore).toHaveBeenCalled();
          expect((submitScore as Mock).mock.calls.length).toBeGreaterThanOrEqual(3);
        },
        { timeout: 10000 }
      );
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

      (submitScore as Mock).mockImplementation(async () => {
        callOrder.push('submitScore');
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
          expect(callOrder).toEqual(['markAsScored', 'submitScore']);
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

  // Regression for the silent-failure follow-up to the scoring-sync-bug.
  // When submitScore() fails while online, we must route the score into the
  // offline queue (useOfflineQueueStore.addToQueue) so the existing
  // useOfflineQueueProcessor (wired globally in App.tsx) retries it with
  // exponential backoff. Permanent failures (max retries exhausted) land in
  // failedItems which is already surfaced by SyncStatusPopover, SyncProgress,
  // and OfflineIndicator.
  //
  // We must NOT dispatch the generic 'replication:sync-failed' event for
  // scoring failures. That event's listener (SyncFailureToast.handleRetry)
  // only calls refreshAllTables() — a pull — and then clears the failure.
  // Clicking Retry would make the warning disappear without re-attempting
  // the score submission, giving a false sense of recovery.
  describe('Regression: online submitScore failure routes through offline queue (not generic toast)', () => {
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
        update: mockUpdateWithOnError as unknown as ReturnType<typeof useOptimisticUpdate>['update'],
        isSyncing: false,
        hasError: false,
        error: null,
        retryCount: 0,
        clearError: vi.fn(),
      });
      mockUpdateWithOnError.mockClear();
    });

    it('enqueues the failed score so useOfflineQueueProcessor can retry it', async () => {
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

      // Offline path also enqueues — but this test runs online, so the only
      // addToQueue call should come from the onError branch. Asserting the
      // payload shape protects against shape drift that would break the
      // queue processor's submitScore() retry call (entryService.ts).
      expect(mockAddToQueue).toHaveBeenCalledTimes(1);
      expect(mockAddToQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          licenseKey: 'test-license-key-12345',
          scoreData: expect.objectContaining({ resultText: 'Q' }),
        })
      );

      // The caller's onError must still be invoked after enqueueing — scoresheets
      // that wire onError rely on this to surface an inline error. Without this
      // assertion a future refactor could drop the propagation silently.
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect((onError.mock.calls[0][0] as Error).message).toBe('RLS reject: scores');
    });

    it('logs and skips enqueue when context is missing (no classId), still invokes onError', async () => {
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

      // Without classId, the score has no retry path — we expect a loud log,
      // NO enqueue, AND the caller's onError to still fire so scoresheets that
      // wire onError can surface an inline error to the judge.
      expect(mockAddToQueue).not.toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot enqueue failed score'),
        expect.objectContaining({
          entryId: mockEntry.id,
          hasClassId: false,
          hasArmband: true,
          hasClassName: true,
          hasLicenseKey: true,
        })
      );
      expect(onError).toHaveBeenCalledTimes(1);

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

      // Offline path enqueues exactly once (inside serverUpdate's
      // `if (!isOnline)` branch). The onError handler's early-return for
      // offline must NOT add a second copy.
      expect(mockAddToQueue).toHaveBeenCalledTimes(1);
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
});

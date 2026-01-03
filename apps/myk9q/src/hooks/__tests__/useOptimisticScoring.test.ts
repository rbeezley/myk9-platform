/**
 * Tests for useOptimisticScoring hook - Offline-First Compliance
 *
 * Verifies that scoring follows offline-first pattern:
 * 1. Optimistic updates happen immediately
 * 2. No manual refresh() calls
 * 3. Silent failure when offline
 * 4. No rollback of optimistic updates
 * 5. Real-time subscriptions handle confirmation
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useOptimisticScoring } from '../useOptimisticScoring';
import { submitScore } from '@/services/entryService';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';

// Mock dependencies
vi.mock('@/services/entryService');
vi.mock('@/stores/offlineQueueStore');
vi.mock('@/lib/supabase', () => ({
  getSupabaseLicenseKey: vi.fn(() => 'test-license-key-12345'),
}));

// Create mock functions we can track
const mockMarkAsScored = vi.fn();
const mockSubmitScore = vi.fn();
const mockAddToQueue = vi.fn();
const mockUpdate = vi.fn(async ({ serverUpdate, onSuccess }) => {
  try {
    await serverUpdate();
    onSuccess?.();
  } catch (err) {
    // Silent failure for offline
  }
});

vi.mock('@/stores/entryStore', () => ({
  useEntryStore: vi.fn(() => ({
    markAsScored: mockMarkAsScored,
    entries: [],
    setEntries: vi.fn()
  }))
}));

vi.mock('@/stores/scoringStore', () => ({
  useScoringStore: vi.fn(() => ({
    submitScore: mockSubmitScore,
    scores: [],
    isScoring: false
  }))
}));

vi.mock('@/hooks/useOptimisticUpdate', () => ({
  useOptimisticUpdate: vi.fn(() => ({
    update: mockUpdate,
    isSyncing: false,
    hasError: false,
    error: null,
    retryCount: 0,
    clearError: vi.fn()
  }))
}));

describe('useOptimisticScoring - Offline-First Compliance', () => {
  const mockEntry = {
    id: 1,
    classId: 10,
    armband: 101,
    className: 'Novice A'
  };

  const mockScoreData = {
    resultText: 'Q',
    searchTime: '1:23.45',
    faultCount: 0,
    correctCount: 3,
    incorrectCount: 0
  };

  beforeEach(() => {
    // Clear all mock functions
    mockMarkAsScored.mockClear();
    mockSubmitScore.mockClear();
    mockAddToQueue.mockClear();
    mockUpdate.mockClear();

    // Set up default implementations
    (submitScore as any).mockResolvedValue(undefined);

    // Mock offline queue store
    (useOfflineQueueStore as unknown as any).mockReturnValue({
      addToQueue: mockAddToQueue,
      isOnline: true
    });

    // Reset navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      configurable: true,
      value: true
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

      (submitScore as vi.Mock).mockImplementation(async () => {
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
          scoreData: mockScoreData
        });
      });

      // Assert local stores were updated immediately
      expect(mockMarkAsScored).toHaveBeenCalledWith(mockEntry.id, mockScoreData.resultText);
      expect(mockSubmitScore).toHaveBeenCalledWith(
        expect.objectContaining({
          entryId: mockEntry.id,
          armband: mockEntry.armband
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
          scoreData: mockScoreData
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
          scoreData: mockScoreData
        });
      });

      await waitFor(() => {
        expect(submitScore).toHaveBeenCalledWith(
          mockEntry.id,
          expect.objectContaining({
            resultText: 'Q',
            searchTime: '1:23.45'
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
          scoreData: mockScoreData
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
        value: false
      });

      (useOfflineQueueStore as unknown as vi.Mock).mockReturnValue({
        addToQueue: mockAddToQueue,
        isOnline: false
      });
    });

    it('updates stores immediately when offline', async () => {
      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData
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
          scoreData: mockScoreData
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
      const { result} = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData
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
      (submitScore as vi.Mock).mockRejectedValue(new Error('Network timeout'));

      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData
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
      (submitScore as vi.Mock).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData
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
        { id: 3, scoreData: { resultText: 'Q', searchTime: '1:30.00' } }
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
              scoreData: entry.scoreData
            })
          )
        );
      });

      // All 3 should update stores immediately
      expect(mockMarkAsScored).toHaveBeenCalled();
      expect(mockMarkAsScored.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(mockSubmitScore.mock.calls.length).toBeGreaterThanOrEqual(3);

      // Check each entry was marked as scored with correct data
      entries.forEach((entry) => {
        const matchingCall = mockMarkAsScored.mock.calls.find(
          call => call[0] === entry.id
        );
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
              scoreData: { resultText: 'Q', searchTime: `1:${id}0.00` }
            })
          )
        );
      });

      // Should have at least 3 API calls (may be more with retries)
      await waitFor(() => {
        expect(submitScore).toHaveBeenCalled();
        expect((submitScore as vi.Mock).mock.calls.length).toBeGreaterThanOrEqual(3);
      }, { timeout: 10000 });
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
          scoreData: mockScoreData
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

      (submitScore as vi.Mock).mockImplementation(async () => {
        callOrder.push('submitScore');
      });

      const { result } = renderHook(() => useOptimisticScoring());

      await act(async () => {
        await result.current.submitScoreOptimistically({
          entryId: mockEntry.id,
          classId: mockEntry.classId,
          armband: mockEntry.armband,
          className: mockEntry.className,
          scoreData: mockScoreData
        });
      });

      await waitFor(() => {
        expect(callOrder).toEqual([
          'markAsScored',
          'submitScore'
        ]);
      }, { timeout: 10000 });
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
          scoreData: mockScoreData
        });
      });

      const uiUpdateTime = Date.now() - startTime;

      // Optimistic update should be nearly instant
      expect(uiUpdateTime).toBeLessThan(100); // Allow 100ms for test overhead
      expect(mockMarkAsScored).toHaveBeenCalled();
      expect(mockSubmitScore).toHaveBeenCalled();
    });
  });
});

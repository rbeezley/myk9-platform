/**
 * useOptimisticScoring - Simplified offline-first score submission
 *
 * Provides optimistic updates for scoring with offline queue support.
 * Adapted for myK9Show's infrastructure.
 *
 * Flow:
 * 1. Judge clicks "Save Score" → Score appears saved INSTANTLY
 * 2. Judge can navigate to next dog immediately
 * 3. Score syncs with server in background
 * 4. If offline, score is saved in IndexedDB for later sync
 */

import { useCallback, useState, useEffect } from 'react';
import { useOptimisticUpdate } from './useOptimisticUpdate';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { useScoringStore, type QualifyingResult } from '@/stores/scoringStore';
import { logger } from '@/services/LoggingService';

export interface ScoreSubmissionData {
  entryId: string | number;
  classId: string | number;
  armband: number;
  className: string;
  scoreData: {
    resultText: string;
    searchTime?: string;
    faultCount?: number;
    points?: number;
    nonQualifyingReason?: string;
    areas?: { [key: string]: string };
    element?: string;
    level?: string;
    // Additional scoring data (used by specific scoresheets)
    correctCount?: number;
    incorrectCount?: number;
    finishCallErrors?: number;
    areaTimes?: string[];
    // Allow additional properties for extensibility
    [key: string]: unknown;
  };
}

export interface OptimisticScoringOptions {
  /** Entry ID to score */
  entryId: string | number;
  /** Score data to submit */
  scoreData: ScoreSubmissionData['scoreData'];
  /** Class ID for offline queue */
  classId?: string | number;
  /** Armband for offline queue */
  armband?: number;
  /** Class name for offline queue */
  className?: string;
  /** Called when score successfully syncs */
  onSuccess?: () => void;
  /** Called when score fails to sync after all retries */
  onError?: (error: Error) => void;
}

/**
 * Convert result text to status for IndexedDB
 */
function convertResultTextToStatus(resultText: string): string {
  switch (resultText) {
    case 'Q':
      return 'qualified';
    case 'NQ':
      return 'not_qualified';
    case 'ABS':
      return 'absent';
    case 'EX':
      return 'excused';
    default:
      return 'pending';
  }
}

/**
 * Convert time string (M:SS.ss) to seconds
 */
function convertTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const mins = parseInt(parts[0], 10) || 0;
  const secs = parseFloat(parts[1] || '0');
  return mins * 60 + secs;
}

export function useOptimisticScoring() {
  const { update, isSyncing, hasError, error, retryCount, clearError } = useOptimisticUpdate();
  const { submitScore: addScoreToSession } = useScoringStore();
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const submitScoreOptimistically = useCallback(
    async (options: OptimisticScoringOptions) => {
      const { entryId, scoreData, armband, onSuccess, onError } = options;

      // Step 1: Update local state IMMEDIATELY (< 50ms)
      const optimisticResult = scoreData.resultText;

      // Update IndexedDB cache immediately (works offline)
      try {
        const resultStatus = convertResultTextToStatus(optimisticResult);
        const searchTimeSeconds = scoreData.searchTime
          ? convertTimeToSeconds(scoreData.searchTime)
          : 0;

        await replicatedEntriesTable.updateEntry(String(entryId), {
          // Write both camelCase and snake_case so toSupabaseRow() picks up the values
          resultStatus: resultStatus,
          result_status: resultStatus,
          isScored: resultStatus !== 'pending',
          is_scored: resultStatus !== 'pending',
          searchTimeSeconds: searchTimeSeconds,
          search_time_seconds: searchTimeSeconds,
          totalFaults: scoreData.faultCount ?? 0,
          total_faults: scoreData.faultCount ?? 0,
          scoringCompletedAt: new Date().toISOString(),
          scoring_completed_at: new Date().toISOString(),
        });

        logger.debug(
          `✅ [useOptimisticScoring] Updated local cache for entry ${entryId}`,
          'scoring'
        );
      } catch (cacheError) {
        // Non-fatal: cache update failed but we can continue
        logger.warn(
          '⚠️ [useOptimisticScoring] Failed to update local cache',
          'scoring',
          {},
          cacheError as Error
        );
      }

      // Add to scoring session for local tracking
      addScoreToSession({
        entryId,
        armband: armband || 0,
        time: scoreData.searchTime || '0:00.00',
        qualifying: optimisticResult as QualifyingResult,
        areas: scoreData.areas || {},
        ...(scoreData.nonQualifyingReason !== undefined && {
          nonQualifyingReason: scoreData.nonQualifyingReason,
        }),
        ...(scoreData.faultCount !== undefined && { faults: scoreData.faultCount }),
      });

      // Step 2: Sync with server in background
      await update({
        optimisticData: { entryId, scoreData },
        serverUpdate: async () => {
          // Check if online
          if (!isOnline) {
            // Score is already saved in IndexedDB - will sync when back online
            // The replication system handles sync automatically
            throw new Error('Offline - score saved locally');
          }

          // The entry is saved in IndexedDB and will be synced
          // automatically by the replication system
          return { entryId, scoreData };
        },
        onSuccess: () => {
          onSuccess?.();
        },
        onError: err => {
          logger.error('❌ Score submission failed', 'scoring', {}, err);

          // If offline, we already saved it locally, so allow navigation
          if (!isOnline || err.message.includes('Offline')) {
            onSuccess?.(); // Still allow navigation
            return;
          }

          // Real error - notify user
          onError?.(err);
        },
        maxRetries: 3,
        retryDelay: 1000,
      });
    },
    [update, addScoreToSession, isOnline]
  );

  return {
    /** Submit score with optimistic update */
    submitScoreOptimistically,
    /** Whether currently syncing with server */
    isSyncing,
    /** Whether last sync failed (but score is saved locally) */
    hasError,
    /** Error details if sync failed */
    error,
    /** Number of retry attempts made */
    retryCount,
    /** Clear error state */
    clearError,
  };
}

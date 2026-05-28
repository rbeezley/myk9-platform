import { useCallback } from 'react';
import { useOptimisticUpdate } from './useOptimisticUpdate';
import { useEntryStore } from '../stores/entryStore';
import { useScoringStore, type QualifyingResult } from '@myk9/scoring';
import { useOfflineQueueStore } from '../stores/offlineQueueStore';
import { replicatedEntriesTable } from '@/services/replication';
import { convertResultTextToStatus } from '@/utils/transformationUtils';
import { convertTimeToSeconds } from '@/services/entryTransformers';
import { logger } from '@/utils/logger';

/**
 * Specialized hook for optimistic score submissions
 *
 * Flow:
 * 1. Judge clicks "Save Score" → Score appears saved INSTANTLY
 * 2. Judge can navigate to next dog immediately
 * 3. Score syncs with server in background
 * 4. If sync fails, show error indicator and queue for retry
 * 5. Automatic retry with exponential backoff (3 attempts)
 *
 * @example
 * const { submitScoreOptimistically, isSyncing, hasError } = useOptimisticScoring();
 *
 * const handleSave = async () => {
 *   await submitScoreOptimistically({
 *     entryId: currentEntry.id,
 *     scoreData: { resultText: 'Q', searchTime: '1:23.45', ... },
 *     onSuccess: () => navigate('/entries'),
 *   });
 * };
 */

export interface ScoreSubmissionData {
  entryId: string;
  classId: number;
  armband: number;
  className: string;
  scoreData: {
    resultText: string;
    searchTime?: string;
    faultCount?: number;
    points?: number;
    nonQualifyingReason?: string;
    areas?: { [key: string]: string };
    healthCheckPassed?: boolean;
    mph?: number;
    score?: number;
    deductions?: number;
    correctCount?: number;
    incorrectCount?: number;
    finishCallErrors?: number;
    areaTimes?: string[];
    element?: string;
    level?: string;
  };
}

export interface OptimisticScoringOptions {
  /** Entry ID to score */
  entryId: string;
  /** Score data to submit */
  scoreData: ScoreSubmissionData['scoreData'];
  /** Class ID for offline queue */
  classId?: number;
  /** Armband for offline queue */
  armband?: number;
  /** Class name for offline queue */
  className?: string;
  /** Called when score successfully syncs */
  onSuccess?: () => void;
  /** Called when score fails to sync after all retries */
  onError?: (error: Error) => void;
  /** Paired class ID for combined Novice A & B view */
  pairedClassId?: number;
}

export function useOptimisticScoring() {
  const { update, isSyncing, hasError, error, retryCount, clearError } = useOptimisticUpdate();
  const { markAsScored } = useEntryStore();
  const { submitScore: addScoreToSession } = useScoringStore();
  const { isOnline } = useOfflineQueueStore();

  const submitScoreOptimistically = useCallback(
    async (options: OptimisticScoringOptions) => {
      const { entryId, scoreData, armband, onSuccess, onError } = options;

      // Step 1: Update local state IMMEDIATELY (< 50ms)
      // This makes the UI feel instant
      const optimisticResult = scoreData.resultText;

      // Mark as scored in local store (legacy Zustand store)
      markAsScored(entryId, optimisticResult);

      // Mark cache row dirty and queue the server write through the shared
      // mutation manager. The database trigger handles completion/placement.
      const resultStatus = convertResultTextToStatus(optimisticResult);
      const searchTimeSeconds = scoreData.searchTime
        ? convertTimeToSeconds(scoreData.searchTime)
        : 0;

      await replicatedEntriesTable.markAsScored(
        String(entryId),
        {
          result_status: resultStatus,
          search_time_seconds: searchTimeSeconds,
          total_faults: scoreData.faultCount,
        },
        true // isDirty=true — protects optimistic score from pull-overwrite and queues upload
      );
      logger.log(`✅ [useOptimisticScoring] Updated replicated cache for entry ${entryId}`);

      // Add to scoring session for local tracking
      // Cast to QualifyingResult - resultText should match valid qualifying values at runtime
      addScoreToSession({
        entryId,
        armband: armband || 0,
        time: scoreData.searchTime || '0:00.00',
        qualifying: optimisticResult as QualifyingResult,
        areas: scoreData.areas || {},
        nonQualifyingReason: scoreData.nonQualifyingReason,
        correctCount: scoreData.correctCount,
        incorrectCount: scoreData.incorrectCount,
        faults: scoreData.faultCount, // Map faultCount to faults for Score interface
        finishCallErrors: scoreData.finishCallErrors,
      });

      // Step 2: Sync with server in background
      await update({
        optimisticData: { entryId, scoreData },
        serverUpdate: async () => {
          if (!isOnline) {
            logger.log(`📴 [useOptimisticScoring] Score ${entryId} queued for sync when online`);
          }

          return { entryId, scoreData };
        },
        onSuccess: () => {
          onSuccess?.();
        },
        onError: err => {
          logger.error('❌ Score submission failed:', err);

          if (!isOnline) {
            onSuccess?.(); // Still allow navigation
            return;
          }

          onError?.(err);
        },
        onRollback: () => {
          // The markAsScored already happened, could add undo logic here if needed
        },
        maxRetries: 3,
        retryDelay: 1000, // 1 second, exponential backoff in hook
      });
    },
    [update, markAsScored, addScoreToSession, isOnline]
  );

  return {
    /** Submit score with optimistic update */
    submitScoreOptimistically,
    /** Whether currently syncing with server */
    isSyncing,
    /** Whether last sync failed */
    hasError,
    /** Error details if sync failed */
    error,
    /** Number of retry attempts made */
    retryCount,
    /** Clear error state */
    clearError,
  };
}

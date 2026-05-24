import { useCallback } from 'react';
import { useOptimisticUpdate } from './useOptimisticUpdate';
import { submitScore } from '../services/entryService';
import { useEntryStore } from '../stores/entryStore';
import { useScoringStore, type QualifyingResult } from '@myk9/scoring';
import { useOfflineQueueStore } from '../stores/offlineQueueStore';
import { getSupabaseLicenseKey } from '../lib/supabase';
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
  entryId: number;
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
  entryId: number;
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
  const { addToQueue, isOnline } = useOfflineQueueStore();

  const submitScoreOptimistically = useCallback(async (options: OptimisticScoringOptions) => {
    const {
      entryId,
      scoreData,
      classId,
      armband,
      className,
      onSuccess,
      onError,
      pairedClassId,
    } = options;

    // Step 1: Update local state IMMEDIATELY (< 50ms)
    // This makes the UI feel instant
    const optimisticResult = scoreData.resultText;

    // Mark as scored in local store (legacy Zustand store)
    markAsScored(entryId, optimisticResult);

    // Update the replicated entries cache (IndexedDB) AND queue a mutation so
    // the write goes through MutationManager's retry + toast pipeline. The
    // cache row is marked _syncStatus: 'pending', which protects it from
    // being overwritten when a replication pull arrives before the server
    // has the score.
    //
    // Previously this used queueMutation=false because offlineQueueStore was
    // the only offline-sync path for scoring. That left scoring writes outside
    // MutationManager's failure-toast pipeline — when `submitScore` (the
    // online inline write below) failed silently with an RLS reject or
    // transient error, no toast fired AND the cache row wasn't dirty-marked,
    // so the next replication pull overwrote the locally-scored row with
    // stale server state. That reproduced as "scored dog reverts when next
    // dog is scored." See project_scoring_sync_bug.md.
    //
    // Trade-off accepted: on the happy path this now produces a double-write —
    // the queue fires `entries UPDATE` ~100ms after `submitScore` does the
    // same. Idempotent and harmless. We keep `submitScore` for its placement
    // calculation + class-completion side effects; routing the entries UPDATE
    // through the queue is purely additive for the failure surface.
    try {
      const resultStatus = convertResultTextToStatus(optimisticResult);
      const searchTimeSeconds = scoreData.searchTime ? convertTimeToSeconds(scoreData.searchTime) : 0;

      await replicatedEntriesTable.markAsScored(
        String(entryId),
        {
          result_status: resultStatus,
          search_time_seconds: searchTimeSeconds,
          total_faults: scoreData.faultCount,
        },
        true // Queue mutation so MutationManager's toast pipeline covers failures
      );
      logger.log(`✅ [useOptimisticScoring] Updated replicated cache for entry ${entryId}`);
    } catch (cacheError) {
      // Non-fatal: cache update failed but we can continue
      // The entry will sync properly when back online
      logger.warn(`⚠️ [useOptimisticScoring] Failed to update replicated cache:`, cacheError);
    }

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
        // Check if online
        if (!isOnline) {
// Add to offline queue if we have the required data
          const licenseKey = getSupabaseLicenseKey();
          if (classId && armband && className && licenseKey) {
            addToQueue({
              entryId,
              armband,
              classId,
              className,
              licenseKey, // Required for background sync RLS
              scoreData,
            });
          }

          // Throw error to trigger retry when back online
          throw new Error('Offline - queued for sync');
        }

        // Submit to server
        await submitScore(entryId, scoreData, pairedClassId, classId);

        // Real-time subscription will confirm the database update
        // Placement calculation is handled inside submitScore() in the background

        return { entryId, scoreData };
      },
      onSuccess: () => {
        onSuccess?.();
      },
      onError: (err) => {
        logger.error('❌ Score submission failed:', err);

        // If offline, we already queued it, so don't show error
        if (!isOnline) {
onSuccess?.(); // Still allow navigation
          return;
        }

        // Real error - notify user
        onError?.(err);
      },
      onRollback: () => {
// The markAsScored already happened, could add undo logic here if needed
      },
      maxRetries: 3,
      retryDelay: 1000, // 1 second, exponential backoff in hook
    });

  }, [update, markAsScored, addScoreToSession, addToQueue, isOnline]);

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

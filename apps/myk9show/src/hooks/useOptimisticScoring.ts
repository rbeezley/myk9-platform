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
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';
import { useScoringStore, type QualifyingResult } from '@/store/scoringStore';
import { logger } from '@/services/LoggingService';
import { mapQualificationToResultStatus } from '@/utils/scoringMappings';

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

      // Persist to the durable offline queue FIRST. This is the ONLY write that
      // makes the score survive a refresh/crash and eventually reach the server,
      // so it is fail-closed: if it throws (queue overflow, IDB/quota failure,
      // entry missing from cache) or returns no mutation id (no MutationManager
      // wired), the score is NOT durably saved and we must surface a blocking
      // error instead of showing success and navigating away. A green checkmark
      // over an unsaved score is the one outcome we can never allow — a judge
      // cannot re-derive a run they already released.
      try {
        const resultStatus = mapQualificationToResultStatus(optimisticResult);
        const searchTimeSeconds = scoreData.searchTime
          ? convertTimeToSeconds(scoreData.searchTime)
          : 0;

        // Full scent-work detail — all ringside-RPC-whitelisted columns, so
        // updateEntry auto-routes through ringside_update_entry. Include a field
        // ONLY when present so a non-scent-work / partial score doesn't null out
        // columns it never set. Previously these lived only in the local Zustand
        // session and were lost on device loss, invisible to reports (audit M3).
        const areaSeconds = (scoreData.areaTimes ?? []).map(t =>
          t ? convertTimeToSeconds(t) : 0
        );
        const detailFields: Partial<ReplicatedEntry> = {};
        // A full score submit is authoritative for all four area columns: write
        // each one, clearing an omitted/cleared area to null. Blank times are
        // filtered from areaTimes, so a rescore that drops a later area sends a
        // shorter array — writing null (not omitting) overwrites the stale value
        // instead of leaving the old area2/3/4 time on the entry and in reports.
        detailFields.area1_time_seconds = areaSeconds[0] ?? null;
        detailFields.area2_time_seconds = areaSeconds[1] ?? null;
        detailFields.area3_time_seconds = areaSeconds[2] ?? null;
        detailFields.area4_time_seconds = areaSeconds[3] ?? null;
        if (scoreData.correctCount !== undefined)
          detailFields.total_correct_finds = scoreData.correctCount;
        if (scoreData.incorrectCount !== undefined)
          detailFields.total_incorrect_finds = scoreData.incorrectCount;
        if (scoreData.finishCallErrors !== undefined)
          detailFields.no_finish_count = scoreData.finishCallErrors;
        if (scoreData.points !== undefined) detailFields.points_earned = scoreData.points;
        // A full score submit is authoritative: clear the disqualification reason
        // to null when there isn't one, so a rescore from NQ/DQ→Qualified doesn't
        // leave the old reason attached (the RPC delta only touches sent fields,
        // and updateEntry merges over the cached row). Write the reason when present.
        detailFields.disqualification_reason = scoreData.nonQualifyingReason ?? null;

        const mutationId = await replicatedEntriesTable.updateEntry(String(entryId), {
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
          ...detailFields,
        });

        if (mutationId === null) {
          // The row was marked dirty locally but no mutation was queued, so it
          // will never upload. Treat as a hard failure.
          throw new Error(
            'Score could not be queued for sync (no replication manager). Please retry.'
          );
        }

        logger.debug(
          `✅ [useOptimisticScoring] Queued score for entry ${entryId} (mutation ${mutationId})`,
          'scoring'
        );
      } catch (queueError) {
        // Fatal: the score is not durably saved. Surface a blocking error and
        // do NOT run the optimistic-success path (no session write, no navigate).
        const err = queueError instanceof Error ? queueError : new Error(String(queueError));
        logger.error(
          '❌ [useOptimisticScoring] Failed to queue score — NOT saved',
          'scoring',
          {},
          err
        );
        onError?.(err);
        return;
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

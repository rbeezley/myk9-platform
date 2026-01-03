import { supabase } from '@/lib/supabase';
import { EntryStatus } from '@/stores/entryStore';
import { QueuedScore } from '@/stores/offlineQueueStore';
import { convertTimeToSeconds } from '../entryTransformers';
import { triggerImmediateEntrySync } from '../entryReplication';
import { checkAndUpdateClassCompletion } from './classCompletionService';
import { convertResultTextToStatus } from '@/utils/transformationUtils';
import { determineAreasForClass } from '@/utils/classUtils';
import { calculateTotalAreaTime } from '@/utils/calculationUtils';
import { logger } from '@/utils/logger';

/**
 * Score Submission Service
 *
 * Handles all score submission logic for dog sport trials, including:
 * - Single score submission with validation
 * - Batch score submission from offline queue
 * - Area time calculations for AKC Scent Work
 * - Background task orchestration (class completion, placement calculation)
 *
 * **Phase 2, Task 2.1** - Extracted from entryService.ts
 *
 * **Key Features**:
 * - Single database write (entries table only - post migration 039)
 * - Immediate replication sync for instant UI updates
 * - Fire-and-forget background tasks for performance
 * - Support for paired classes (Novice A & B combined views)
 *
 * **Performance Optimization**:
 * - Optional classId parameter avoids database lookup (~50ms faster)
 * - Background task execution doesn't block score save
 * - Typical save time: ~100ms (vs ~200ms+ with blocking tasks)
 */

/**
 * Score data interface for submission
 *
 * Supports multiple scoring types:
 * - Standard (resultText, searchTime, faultCount)
 * - AKC Scent Work (area times, element, level)
 * - Nationals (correctCount, incorrectCount, finishCallErrors)
 * - Rally/Obedience (points, deductions, score)
 */
export interface ScoreData {
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
  // Nationals-specific fields
  correctCount?: number;
  incorrectCount?: number;
  finishCallErrors?: number;
  // Area time fields for AKC Scent Work
  areaTimes?: string[];
  element?: string;
  level?: string;
}

/**
 * Result data structure for database update
 *
 * Maps to entries table columns (post migration 039)
 * Results are stored directly in entries, not separate results table
 */
export interface ResultData {
  entry_id: number;
  result_status: string;
  search_time_seconds: number;
  is_scored: boolean;
  is_in_ring: boolean;
  scoring_completed_at: string | null;
  total_faults?: number;
  disqualification_reason?: string;
  points_earned?: number;
  total_score?: number;
  total_correct_finds?: number;
  total_incorrect_finds?: number;
  no_finish_count?: number;
  area1_time_seconds?: number;
  area2_time_seconds?: number;
  area3_time_seconds?: number;
}

/**
 * Prepare score update data from raw score input
 *
 * Transforms user-provided score data into database format:
 * - Maps result text to result_status enum
 * - Converts time strings to seconds
 * - Sets completion timestamps
 * - Adds optional fields conditionally
 *
 * @param entryId - Entry ID being scored
 * @param scoreData - Raw score data from scoresheet
 * @returns Partial result data ready for database update
 *
 * @private Internal helper for submitScore
 */
function prepareScoreUpdateData(
  entryId: number,
  scoreData: ScoreData
): Partial<ResultData> {
  // Map the result text to the valid enum values
  const resultStatus = convertResultTextToStatus(scoreData.resultText);

  // Only mark as scored if we have a valid result status (not 'pending')
  const isActuallyScored = resultStatus !== 'pending';

  // 🔍 DIAGNOSTIC: Log scoring conversion for debugging
   
  logger.log('🎯 [scoreSubmission] prepareScoreUpdateData:', {
    entryId,
    inputResultText: scoreData.resultText,
    convertedResultStatus: resultStatus,
    isActuallyScored,
    willSetEntryStatus: isActuallyScored ? 'completed' : 'in-ring'
  });

  // Non-qualifying results should have no meaningful times
  // NQ/Excused/Absent/Withdrawn dogs didn't complete a valid search
  const isNonQualifyingResult = ['nq', 'excused', 'absent', 'withdrawn'].includes(resultStatus);

  const scoreUpdateData: Partial<ResultData> = {
    entry_id: entryId,
    result_status: resultStatus,
    search_time_seconds: isNonQualifyingResult ? 0 : (scoreData.searchTime ? convertTimeToSeconds(scoreData.searchTime) : 0),
    is_scored: isActuallyScored,
    is_in_ring: false, // Mark as no longer in ring when score is submitted
    scoring_completed_at: isActuallyScored ? new Date().toISOString() : null,
  };

  // Clear area times for non-qualifying results
  // These dogs didn't complete a valid search, so times are meaningless
  if (isNonQualifyingResult) {
    scoreUpdateData.area1_time_seconds = 0;
    scoreUpdateData.area2_time_seconds = 0;
    scoreUpdateData.area3_time_seconds = 0;
  }

  // Add optional fields if they exist
  if (scoreData.faultCount !== undefined) {
    scoreUpdateData.total_faults = scoreData.faultCount;
  }
  if (scoreData.nonQualifyingReason) {
    scoreUpdateData.disqualification_reason = scoreData.nonQualifyingReason;
  }
  if (scoreData.points !== undefined) {
    scoreUpdateData.points_earned = scoreData.points;
  }
  if (scoreData.score !== undefined) {
    scoreUpdateData.total_score = parseFloat(scoreData.score.toString());
  }
  if (scoreData.correctCount !== undefined) {
    scoreUpdateData.total_correct_finds = scoreData.correctCount;
  }
  if (scoreData.incorrectCount !== undefined) {
    scoreUpdateData.total_incorrect_finds = scoreData.incorrectCount;
  }
  if (scoreData.finishCallErrors !== undefined) {
    scoreUpdateData.no_finish_count = scoreData.finishCallErrors;
  }

  return scoreUpdateData;
}

/**
 * Handle AKC Scent Work area time calculations
 *
 * AKC Scent Work classes can have 1-3 search areas depending on:
 * - Element (Interior, Exterior, Container, Buried, Handler Discrimination)
 * - Level (Novice, Advanced, Excellent, Master, Detective)
 *
 * Examples:
 * - Interior Novice: 1 area
 * - Interior Excellent: 2 areas
 * - Interior Master: 3 areas
 * - Handler Discrimination Master: 2 areas
 *
 * @param scoreData - Score data containing area times
 * @param scoreUpdateData - Mutable score update object to modify
 *
 * @private Internal helper for submitScore
 */
function handleAreaTimes(
  scoreData: ScoreData,
  scoreUpdateData: Partial<ResultData>
): void {
  if (!scoreData.areaTimes || scoreData.areaTimes.length === 0) {
    return;
  }

  const element = scoreData.element || '';
  const level = scoreData.level || '';

  // Convert area times to seconds
  const areaTimeSeconds = scoreData.areaTimes.map((time) => convertTimeToSeconds(time));

  // Determine which areas are applicable for this class
  const { useArea1, useArea2, useArea3 } = determineAreasForClass(element, level);

  // Area 1 is always used
  if (useArea1 && areaTimeSeconds[0] !== undefined) {
    scoreUpdateData.area1_time_seconds = areaTimeSeconds[0];
  }

  // Area 2 (Interior Excellent/Master, Handler Discrimination Master)
  if (useArea2 && areaTimeSeconds[1] !== undefined) {
    scoreUpdateData.area2_time_seconds = areaTimeSeconds[1];
  }

  // Area 3 (Interior Master only)
  if (useArea3 && areaTimeSeconds[2] !== undefined) {
    scoreUpdateData.area3_time_seconds = areaTimeSeconds[2];
  }

  // Calculate total search time from all applicable areas
  scoreUpdateData.search_time_seconds = calculateTotalAreaTime(
    scoreUpdateData.area1_time_seconds,
    scoreUpdateData.area2_time_seconds,
    scoreUpdateData.area3_time_seconds
  );
}

/**
 * Determine entry status based on scoring state
 *
 * Business rules:
 * - Scored entries → 'completed'
 * - Unscored entries → 'in-ring' (still being judged)
 *
 * @param isScored - Whether entry has been fully scored
 * @returns Entry status enum value
 *
 * @private Internal helper for submitScore
 */
function determineEntryStatus(isScored: boolean): EntryStatus {
  return isScored ? 'completed' : 'in-ring';
}

/**
 * Submit a score for an entry
 *
 * Main entry point for score submission. Handles:
 * 1. Data transformation and validation
 * 2. Database update (single write to entries table)
 * 3. Immediate replication sync
 * 4. Background class completion check
 *
 * **Performance Characteristics**:
 * - With classId: ~100ms (single database write + sync)
 * - Without classId: ~150ms (extra lookup query)
 * - Background tasks: ~200ms+ (non-blocking)
 *
 * **Database Schema** (post migration 039):
 * - Scores stored directly in entries table
 * - No separate results table writes
 * - Single atomic update operation
 *
 * @param entryId - Entry ID to score
 * @param scoreData - Score data from scoresheet
 * @param pairedClassId - Optional paired class ID for Novice A & B combined view
 * @param classId - Optional class ID to skip database lookup (performance optimization)
 * @returns Promise<boolean> - true if score saved successfully
 *
 * @throws Error if database update fails
 *
 * @example
 * // Standard scoring
 * await submitScore(123, {
 *   resultText: 'Qualified',
 *   searchTime: '1:30',
 *   faultCount: 0
 * });
 *
 * @example
 * // AKC Scent Work with area times
 * await submitScore(123, {
 *   resultText: 'Qualified',
 *   areaTimes: ['45', '52', '38'],
 *   element: 'Interior',
 *   level: 'Master'
 * });
 *
 * @example
 * // With performance optimization (classId provided)
 * await submitScore(123, scoreData, undefined, 456); // 50ms faster
 */
export async function submitScore(
  entryId: number,
  scoreData: ScoreData,
  pairedClassId?: number,
  classId?: number
): Promise<boolean> {
try {
    // Prepare score data for database update
    const scoreUpdateData = prepareScoreUpdateData(entryId, scoreData);

    // Handle AKC Scent Work area times if present
    handleAreaTimes(scoreData, scoreUpdateData);

    // Remove entry_id from update data (we filter by id instead)
    const { entry_id: _entry_id, ...updateFields } = scoreUpdateData;

    // Determine entry status based on scoring state
    const entryStatus = determineEntryStatus(scoreUpdateData.is_scored || false);

    // Update entries table with score data AND entry_status
    // After migration 039, this is a SINGLE write instead of two separate writes!
    // CRITICAL: Set updated_at to trigger replication sync (no auto-trigger on entries table)
    const updateData = {
      ...updateFields,
      entry_status: entryStatus,
      updated_at: new Date().toISOString(),
    };

    // 🔍 DIAGNOSTIC: Log what we're about to send to database
     
    logger.log('🔍 [scoreSubmission] Database update payload:', {
      entryId,
      updateData,
      is_scored: updateData.is_scored,
      entry_status: updateData.entry_status
    });

    const { data: updateResult, error: updateError } = await supabase
      .from('entries')
      .update(updateData)
      .eq('id', entryId)
      .select();

    // 🔍 DIAGNOSTIC: Log database response
     
    logger.log('✅ [scoreSubmission] Database update result:', {
      entryId,
      success: !updateError,
      result: updateResult,
      error: updateError
    });

    if (updateError) {
      logger.error('❌ Entries table update error:', {
        error: updateError,
        errorMessage: updateError.message,
        errorCode: updateError.code,
        errorDetails: updateError.details,
        errorHint: updateError.hint,
        entryId,
        updateData,
      });
      throw updateError;
    }

    // CRITICAL: Trigger immediate sync to update UI without refresh
    // This ensures the scored dog moves to completed tab immediately
     
    logger.log('🔄 [scoreSubmission] About to trigger immediate sync...');
    await triggerImmediateEntrySync('submitScore');
     
    logger.log('🔄 [scoreSubmission] Immediate sync call completed');

    // OPTIMIZATION: Run class completion check in background
    // This allows the save to complete quickly (~100ms) while background tasks run
    // Users can navigate away immediately without waiting for these operations
    await triggerBackgroundClassCompletion(entryId, classId, pairedClassId);

return true;
  } catch (error) {
    logger.error('Error in submitScore:', error);
    throw error;
  }
}

/**
 * Trigger class completion check in background
 *
 * Fire-and-forget pattern for non-critical background tasks:
 * - Class completion status update
 * - Final placement calculation (happens when class completes)
 *
 * **Performance Strategy**:
 * - Use provided classId if available (fast path)
 * - Query database for classId if not provided (fallback, slower)
 * - Run in background, don't block score save response
 *
 * **Read Replica Workaround**:
 * - Pass the entryId we just scored to the class completion function
 * - This ensures the entry is counted as scored even if read replica is stale
 *
 * @param entryId - Entry ID that was scored
 * @param classId - Optional class ID (performance optimization)
 * @param pairedClassId - Optional paired class for Novice A & B
 *
 * @private Internal helper for submitScore
 */
async function triggerBackgroundClassCompletion(
  entryId: number,
  classId?: number,
  pairedClassId?: number
): Promise<void> {
   
  logger.log(`🔄 [scoreSubmission] triggerBackgroundClassCompletion:`, { entryId, classId, pairedClassId });

  if (classId) {
// Fire and forget - check class completion in background
    // CRITICAL: Pass entryId to work around read replica lag
    (async () => {
      try {
        await checkAndUpdateClassCompletion(classId, pairedClassId, entryId);
} catch (error) {
        logger.error('⚠️ [Background] Failed to check class completion:', error);
      }
    })();
} else {
    // Fallback: Query database for class_id (backward compatibility)
const { data: entryData } = await supabase
      .from('view_entry_class_join_normalized')
      .select('class_id, license_key, show_id')
      .eq('id', entryId)
      .single();

    if (entryData) {
      // Fire and forget - check class completion in background
      // CRITICAL: Pass entryId to work around read replica lag
      (async () => {
        try {
          await checkAndUpdateClassCompletion(entryData.class_id, pairedClassId, entryId);
} catch (error) {
          logger.error('⚠️ [Background] Failed to check class completion:', error);
        }
      })();

} else {
      logger.warn('⚠️ Could not fetch entry data for background processing');
    }
  }
}

/**
 * Submit multiple scores from offline queue
 *
 * Processes queued scores sequentially to avoid overwhelming the server.
 * Used when device comes back online after operating in offline mode.
 *
 * **Processing Strategy**:
 * - Sequential processing (one at a time)
 * - Continue on individual failures
 * - Return success/failure lists for retry logic
 *
 * **Use Cases**:
 * - Offline ringside scoring
 * - Network outage recovery
 * - Mobile trial scoring
 *
 * @param scores - Array of queued scores to submit
 * @returns Promise with lists of successful and failed score IDs
 *
 * @example
 * const result = await submitBatchScores(queuedScores);
 * logger.log(`${result.successful.length} scores saved`);
 * logger.log(`${result.failed.length} scores failed`);
 * // Retry failed scores if needed
 */
export async function submitBatchScores(
  scores: QueuedScore[]
): Promise<{ successful: string[]; failed: string[] }> {
  const successful: string[] = [];
  const failed: string[] = [];

  // Process scores sequentially to avoid overwhelming the server
  for (const score of scores) {
    try {
      await submitScore(score.entryId, score.scoreData);
      successful.push(score.id);
    } catch (error) {
      logger.error(`Failed to submit score ${score.id}:`, error);
      failed.push(score.id);
    }
  }

  return { successful, failed };
}

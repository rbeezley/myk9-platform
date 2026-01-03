import { supabase } from '../lib/supabase';
import { Entry, EntryStatus } from '../stores/entryStore';
import { QueuedScore } from '../stores/offlineQueueStore';
import { initializeDebugFunctions } from './entryDebug';
import {
  getClassEntries as getClassEntriesFromDataLayer,
  getTrialEntries as getTrialEntriesFromDataLayer,
  getEntriesByArmband as getEntriesByArmbandFromDataLayer,
  markInRing as markInRingFromStatusModule,
  markEntryCompleted as markEntryCompletedFromStatusModule,
  updateEntryCheckinStatus as updateEntryCheckinStatusFromStatusModule,
  resetEntryScore as resetEntryScoreFromStatusModule,
  submitScore as submitScoreFromSubmissionModule,
  submitBatchScores as submitBatchScoresFromSubmissionModule,
  subscribeToEntryUpdates as subscribeToEntryUpdatesFromSubscriptionsModule,
  updateExhibitorOrder as updateExhibitorOrderFromBatchModule,
  type RealtimePayload,
} from './entry';
import { buildClassName } from '@/utils/stringUtils';
import { logger } from '@/utils/logger';

/**
 * Service for managing entries and scores
 */

// Initialize debug functions for browser console access
initializeDebugFunctions();

export interface ClassData {
  id: number;
  className: string;
  classType: string;
  trialId: number;
  judgeId?: string;
  totalEntries: number;
  scoredEntries: number;
  isCompleted: boolean;
}

/**
 * ResultData interface has been moved to scoreSubmission.ts (Phase 2, Task 2.1)
 * Import via: import { ResultData } from '@/services/entry';
 */

/**
 * Fetch all entries for a specific class or multiple classes
 *
 * **Phase 1 Complete**: Now uses unified entryDataLayer for cleaner abstraction
 *
 * @param classIds - Single class ID or array of class IDs (for combined Novice A & B view)
 * @param licenseKey - License key for tenant isolation
 */
export async function getClassEntries(
  classIds: number | number[],
  licenseKey: string
): Promise<Entry[]> {
  // Delegate to unified data layer (Phase 1, Task 1.3)
  return getClassEntriesFromDataLayer(classIds, licenseKey);
}

/**
 * Fetch entries for a specific trial
 *
 * **Phase 1 Complete**: Now uses unified entryDataLayer
 */
export async function getTrialEntries(
  trialId: number,
  licenseKey: string
): Promise<Entry[]> {
  // Delegate to unified data layer (Phase 1, Task 1.3)
  return getTrialEntriesFromDataLayer(trialId, licenseKey);
}

/**
 * Submit a score for an entry
 * @param pairedClassId - Optional paired class ID for combined Novice A & B view (updates both classes' status)
 * @param classId - Optional class ID to avoid database lookup (performance optimization)
 *
 * **Phase 2 Task 2.1**: Delegates to scoreSubmission module
 */
export async function submitScore(
  entryId: number,
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
    // Nationals-specific fields
    correctCount?: number;
    incorrectCount?: number;
    finishCallErrors?: number;
    // Area time fields for AKC Scent Work
    areaTimes?: string[];
    element?: string;
    level?: string;
  },
  pairedClassId?: number,
  classId?: number
): Promise<boolean> {
  return submitScoreFromSubmissionModule(entryId, scoreData, pairedClassId, classId);
}

/**
 * Class completion checking moved to classCompletionService.ts (Phase 2, Task 2.3)
 * Import via: import { checkAndUpdateClassCompletion } from './entry';
 */

/**
 * Submit multiple scores from offline queue
 *
 * **Phase 2 Task 2.1**: Delegates to scoreSubmission module
 */
export async function submitBatchScores(
  scores: QueuedScore[]
): Promise<{ successful: string[]; failed: string[] }> {
  return submitBatchScoresFromSubmissionModule(scores);
}

/**
 * Mark an entry as being in the ring
 * IMPORTANT: Does not overwrite 'completed' status - only changes 'no-status' <-> 'in-ring'
 *
 * **Phase 2 Task 2.2**: Delegates to entryStatusManagement module
 *
 * @param entryId - The entry ID
 * @param inRing - true to mark in-ring, false to remove from ring
 * @param knownPreviousStatus - Optional: pass the current status when known (avoids cache lookup issues)
 */
export async function markInRing(
  entryId: number,
  inRing: boolean = true,
  knownPreviousStatus?: import('@/stores/entryStore').EntryStatus
): Promise<boolean> {
  return markInRingFromStatusModule(entryId, inRing, knownPreviousStatus);
}

/**
 * Mark an entry as completed without full scoring details
 * This is used for manual completion by gate stewards when not using ringside scoring
 *
 * **Phase 2 Task 2.2**: Delegates to entryStatusManagement module
 */
export async function markEntryCompleted(entryId: number): Promise<boolean> {
  return markEntryCompletedFromStatusModule(entryId);
}

/**
 * Get class information
 *
 * @deprecated This function is not currently used in the codebase.
 * Consider using getClassEntries() + manual aggregation, or extracting to a dedicated module if needed.
 *
 * **Usage**: Not found in codebase (searched 2025-01-20)
 * **Alternatives**:
 * - Use `getClassEntries(classId, licenseKey)` to get entries
 * - Calculate counts and status from entry list
 * - Query classes table directly if needed
 *
 * **Retention**: Kept for backward compatibility in case external code depends on it.
 */
export async function getClassInfo(
  classId: number,
  licenseKey: string
): Promise<ClassData | null> {
  try {
    // Get class details
    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select(`
        *,
        trials!inner (
          shows!inner (
            license_key
          )
        )
      `)
      .eq('id', classId)
      .eq('trials.shows.license_key', licenseKey)
      .single();

    if (classError || !classData) {
      logger.error('Error fetching class info:', classError);
      return null;
    }

    // Get entry counts
    const { data: entries, error: entriesError } = await supabase
      .from('entries')
      .select('id, is_scored')
      .eq('class_id', classId)
      .eq('license_key', licenseKey);

    if (entriesError) {
      logger.error('Error fetching entry counts:', entriesError);
    }

    const totalEntries = entries?.length || 0;
    const scoredEntries = entries?.filter(e => e.is_scored).length || 0;

    return {
      id: classData.id,
      className: buildClassName(classData.element, classData.level, classData.section),
      classType: classData.class_status,
      trialId: classData.trial_id,
      judgeId: classData.judge_name,
      totalEntries,
      scoredEntries,
      isCompleted: totalEntries > 0 && totalEntries === scoredEntries
    };
  } catch (error) {
    logger.error('Error in getClassInfo:', error);
    return null;
  }
}

/**
 * Subscribe to real-time entry updates
 * Real-time sync is always enabled for multi-user trials
 *
 * @deprecated This function now delegates to entry/entrySubscriptions module (Phase 3, Task 3.1)
 */
export function subscribeToEntryUpdates(
  actualClassId: number,
  licenseKey: string,
  onUpdate: (payload: RealtimePayload) => void
): () => void {
  return subscribeToEntryUpdatesFromSubscriptionsModule(actualClassId, licenseKey, onUpdate);
}

/**
 * Update check-in status for an entry
 *
 * **Phase 2 Task 2.2**: Delegates to entryStatusManagement module
 */
export async function updateEntryCheckinStatus(
  entryId: number,
  checkinStatus: EntryStatus
): Promise<boolean> {
  return updateEntryCheckinStatusFromStatusModule(entryId, checkinStatus);
}

/**
 * Reset a dog's score and return them to pending status
 *
 * **Phase 2 Task 2.2**: Delegates to entryStatusManagement module
 */
export async function resetEntryScore(entryId: number): Promise<boolean> {
  return resetEntryScoreFromStatusModule(entryId);
}

/**
 * Get entries by armband across all classes
 */
/**
 * Fetch entries by armband number
 *
 * **Phase 1 Complete**: Now uses unified entryDataLayer
 */
export async function getEntriesByArmband(
  armband: number,
  licenseKey: string
): Promise<Entry[]> {
  // Delegate to unified data layer (Phase 1, Task 1.3)
  return getEntriesByArmbandFromDataLayer(armband, licenseKey);
}

/**
 * Update exhibitor order for multiple entries (for drag and drop reordering)
 * This updates the database so all users see the new order
 *
 * **Phase 4 Task 4.1**: Delegates to entryBatchOperations module
 */
export async function updateExhibitorOrder(
  reorderedEntries: Entry[]
): Promise<boolean> {
  return updateExhibitorOrderFromBatchModule(reorderedEntries);
}
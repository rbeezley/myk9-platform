import { supabase } from '@/lib/supabase';
import { shouldCheckCompletion } from '@/utils/validationUtils';
import { recalculatePlacementsForClass } from '../placementService';
import { getReplicationManager } from '../replication/ReplicationManager';
import type { Class } from '../replication/tables/ReplicatedClassesTable';
import type { Entry } from '../replication/tables/ReplicatedEntriesTable';
import { logger } from '@/utils/logger';

/** Nested show data from joined query */
interface NestedShow {
  license_key: string;
  show_type?: string;
}

/** Nested trial data with shows from joined query */
interface NestedTrial {
  show_id: number;
  shows: NestedShow;
}

/**
 * Class Completion Service
 *
 * Handles automatic class completion status updates based on scoring progress:
 * - Tracks how many entries are scored vs total entries
 * - Updates class status: not_started → in_progress → completed
 * - Triggers final placement calculations when class completes
 * - Handles paired Novice A & B classes (combined views)
 *
 * **Phase 2, Task 2.3** - Extracted from entryService.ts
 *
 * **Business Rules**:
 * - Class becomes "in_progress" when first dog is scored
 * - Class becomes "completed" when all dogs are scored
 * - Optimization: Only check completion on first and last dog
 * - Final placements recalculated automatically on completion
 */

/**
 * Check if all entries in a class are completed and update class status
 *
 * This is the main entry point, called after score submission or reset.
 * Optionally also checks paired Novice class (A/B) when in combined view.
 *
 * @param classId - The class ID to check completion for
 * @param pairedClassId - Optional paired class ID (only provided when scoring from combined Novice A & B view)
 * @param justScoredEntryId - Optional entry ID that was JUST scored (workaround for read replica lag)
 * @param justResetEntryId - Optional entry ID that was JUST reset/unscored (workaround for read replica lag)
 *
 * @example
 * // Single class
 * await checkAndUpdateClassCompletion(123);
 *
 * @example
 * // Combined Novice A & B view
 * await checkAndUpdateClassCompletion(123, 124);
 *
 * @example
 * // With just-scored entry hint (avoids read replica race condition)
 * await checkAndUpdateClassCompletion(123, undefined, 456);
 *
 * @example
 * // With just-reset entry hint (avoids read replica race condition on reset)
 * await checkAndUpdateClassCompletion(123, undefined, undefined, 789);
 */
export async function checkAndUpdateClassCompletion(
  classId: number,
  pairedClassId?: number,
  justScoredEntryId?: number,
  justResetEntryId?: number
): Promise<void> {
  logger.log(`🔍 [classCompletion] checkAndUpdateClassCompletion called:`, {
    classId,
    pairedClassId,
    justScoredEntryId,
    justResetEntryId
  });

// Update status for the primary class
  await updateSingleClassCompletion(classId, justScoredEntryId, justResetEntryId);

  // Only update paired class if explicitly provided (i.e., scoring from combined view)
  if (pairedClassId) {
await updateSingleClassCompletion(pairedClassId, justScoredEntryId, justResetEntryId);
  }
}

/**
 * Update completion status for a single class
 *
 * **Algorithm**:
 * 1. Count total entries in class
 * 2. Count how many are scored (is_scored = true)
 * 3. Adjust count for read replica lag (just-scored or just-reset entries)
 * 4. Update class status based on progress:
 *    - 0/N scored: mark as "not_started"
 *    - X/N scored: mark as "in_progress"
 *    - N/N scored: mark as "completed" + trigger placement calculations
 *
 * @param classId - The class ID to update
 * @param justScoredEntryId - Optional entry ID that was JUST scored (workaround for read replica lag)
 * @param justResetEntryId - Optional entry ID that was JUST reset/unscored (workaround for read replica lag)
 */
async function updateSingleClassCompletion(
  classId: number,
  justScoredEntryId?: number,
  justResetEntryId?: number
): Promise<void> {
  // CRITICAL FIX: Query LOCAL CACHE instead of server to avoid read replica lag
  // When multiple entries are reset quickly, each completion check was querying
  // the read replica which still showed entries as scored. Since each check only
  // adjusted for its own entryId, the class never saw 0 scored entries.
  // The local cache is updated immediately by resetEntryScore() and has the correct state.

  const manager = getReplicationManager();
  let entries: { id: number; is_scored: boolean }[] = [];
  let usedLocalCache = false;

  if (manager) {
    const entriesTable = manager.getTable('entries');
    if (entriesTable) {
      try {
        // Get all cached entries and filter by class_id
        // Note: getAll requires licenseKey, but entries already filtered by show context
        const allCachedEntries = await entriesTable.getAll() as Entry[];
        const classEntries = allCachedEntries.filter(e => String(e.class_id) === String(classId));

        if (classEntries.length > 0) {
          entries = classEntries.map(e => ({
            id: Number(e.id),
            is_scored: e.is_scored
          }));
          usedLocalCache = true;
          logger.log(`✅ [classCompletion] Using local cache for class ${classId}: ${classEntries.length} entries`);
        }
      } catch (cacheError) {
        logger.warn('⚠️ [classCompletion] Failed to query local cache, falling back to server:', cacheError);
      }
    }
  }

  // Fallback to server query if local cache unavailable
  if (!usedLocalCache) {
    logger.log(`🔄 [classCompletion] Falling back to server query for class ${classId}`);
    const { data: serverEntries, error: entriesError } = await supabase
      .from('entries')
      .select('id, is_scored')
      .eq('class_id', classId);

    if (entriesError || !serverEntries || serverEntries.length === 0) {
      logger.log(`🔍 [classCompletion] No entries found for class ${classId}:`, { entriesError });
      return;
    }

    entries = serverEntries.map(e => ({
      id: e.id,
      is_scored: e.is_scored
    }));
  }

  if (entries.length === 0) {
    logger.log(`🔍 [classCompletion] No entries found for class ${classId}`);
    return;
  }

  // Count scored entries from the (now accurate) data source
  let scoredCount = entries.filter(e => e.is_scored).length;
  const scoredIds = entries.filter(e => e.is_scored).map(e => e.id);

  // Only apply read replica lag adjustments when using server fallback
  // Local cache is already accurate and doesn't need adjustment
  if (!usedLocalCache) {
    // Case 1: Just scored an entry - add to count if read replica missed it
    if (justScoredEntryId && !scoredIds.includes(justScoredEntryId)) {
      logger.log(`⚠️ [classCompletion] Read replica lag (score): entry ${justScoredEntryId} not in scored list, adding to count`);
      scoredCount += 1;
    }

    // Case 2: Just reset an entry - remove from count if read replica still shows it as scored
    if (justResetEntryId && scoredIds.includes(justResetEntryId)) {
      logger.log(`⚠️ [classCompletion] Read replica lag (reset): entry ${justResetEntryId} still in scored list, removing from count`);
      scoredCount -= 1;
    }
  }

  const totalCount = entries.length;

  logger.log(`🔍 [classCompletion] Class ${classId} status:`, {
    scoredCount,
    totalCount,
    scoredIds,
    usedLocalCache,
    justScoredEntryId,
    justResetEntryId,
    willUpdate: true // Always update after reset to ensure class moves to correct tab
  });

  // IMPORTANT: When resetting, we ALWAYS need to update the class status
  // Skip the optimization check if we're handling a reset
  const isResetOperation = justResetEntryId !== undefined;

// Check if we should skip this update (optimization: only check first and last dog)
  // BUT: Always run update after a reset to ensure class moves to correct tab
  if (!isResetOperation && !shouldCheckCompletion(scoredCount, totalCount)) {
    logger.log(`⏭️ [classCompletion] Skipping update for class ${classId} (not first or last dog)`);
return;
  }

  // Handle different completion states
  if (scoredCount === totalCount && totalCount > 0) {
    // All entries scored - mark as completed
    logger.log(`✅ [classCompletion] All entries scored for class ${classId}, marking completed`);
    await markClassCompleted(classId);
  } else if (scoredCount > 0 && scoredCount < totalCount) {
    // Some entries scored - mark as in_progress
    logger.log(`🏃 [classCompletion] Class ${classId} in progress: ${scoredCount}/${totalCount}`);
    await markClassInProgress(classId, scoredCount, totalCount);
  } else {
    // No entries scored - mark as no-status
    logger.log(`⏸️ [classCompletion] Class ${classId} has no scored entries, marking no-status`);
    await markClassNotStarted(classId);
}
}

/**
 * Mark a class as completed and trigger final placement calculations
 *
 * @param classId - The class ID to mark as completed
 */
async function markClassCompleted(classId: number): Promise<void> {
  const { error: updateError } = await supabase
    .from('classes')
    .update({
      is_scoring_finalized: true,
      class_status: 'completed',
    })
    .eq('id', classId);

  if (updateError) {
    logger.error('❌ Error updating class completion:', updateError);
    logger.error('❌ Error message:', updateError.message);
    logger.error('❌ Error details:', updateError.details);
    logger.error('❌ Error hint:', updateError.hint);
    logger.error('❌ Error code:', updateError.code);
    return;
  }

  // CRITICAL: Update local cache to reflect the change immediately
  await updateLocalClassCache(classId, { class_status: 'completed', is_scoring_finalized: true });

// Recalculate placements now that class is complete
  await recalculateFinalPlacements(classId);
}

/**
 * Mark a class as in_progress
 *
 * @param classId - The class ID to mark as in_progress
 * @param scoredCount - Number of scored entries
 * @param totalCount - Total number of entries
 */
async function markClassInProgress(
  classId: number,
  _scoredCount: number,
  _totalCount: number
): Promise<void> {
const { error: updateError } = await supabase
    .from('classes')
    .update({
      is_scoring_finalized: false,
      class_status: 'in_progress',
    })
    .eq('id', classId);

  if (updateError) {
    logger.error('❌ Error updating class status to in_progress:', updateError);
    logger.error('❌ Error message:', updateError.message);
    logger.error('❌ Error details:', updateError.details);
    logger.error('❌ Error hint:', updateError.hint);
    logger.error('❌ Error code:', updateError.code);
    return;
  }

  // CRITICAL: Update local cache to reflect the change immediately
  await updateLocalClassCache(classId, { class_status: 'in_progress', is_scoring_finalized: false });
}

/**
 * Mark a class as no-status (no entries scored)
 *
 * Used when resetting the last scored entry in a class.
 * Valid class_status values: 'no-status', 'setup', 'briefing', 'break', 'start_time', 'in_progress', 'completed'
 * Note: Uses hyphen to match entries.entry_status convention (migration 016)
 *
 * @param classId - The class ID to mark as no-status
 */
async function markClassNotStarted(classId: number): Promise<void> {
  const { error: updateError } = await supabase
    .from('classes')
    .update({
      is_scoring_finalized: false,
      class_status: 'no-status',  // Matches entries.entry_status convention (migration 20251129)
    })
    .eq('id', classId);

  if (updateError) {
    logger.error('❌ Error updating class status to no-status:', updateError);
    logger.error('❌ Error message:', updateError.message);
    logger.error('❌ Error details:', updateError.details);
    logger.error('❌ Error hint:', updateError.hint);
    logger.error('❌ Error code:', updateError.code);
    return;
  }

  // CRITICAL: Update local cache to reflect the change immediately
  await updateLocalClassCache(classId, { class_status: 'no-status', is_scoring_finalized: false });

  logger.log(`✅ [classCompletion] Class ${classId} marked as no-status`);
}

/**
 * Recalculate final placements for a completed class
 *
 * Fetches class details including show info to determine if it's a Nationals event,
 * then triggers placement recalculation with the appropriate rules.
 *
 * @param classId - The class ID to recalculate placements for
 */
async function recalculateFinalPlacements(classId: number): Promise<void> {
  try {
// Get show_id and license_key for this class
    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select(`
        id,
        trial_id,
        trials!inner (
          show_id,
          shows!inner (
            license_key,
            show_type
          )
        )
      `)
      .eq('id', classId)
      .single();

    if (classError) {
      logger.error('❌ Error fetching class data:', classError);
      return;
    }

    if (classData && classData.trials) {
      const trial = classData.trials as unknown as NestedTrial;
      const show = trial.shows;
      const licenseKey = show.license_key;
      const isNationals = show.show_type?.toLowerCase().includes('national') || false;

await recalculatePlacementsForClass(classId, licenseKey, isNationals);
} else {
      logger.error('⚠️ Could not find class or show data for class', classId);
    }
  } catch (placementError) {
    logger.error('⚠️ Failed to calculate final placements:', placementError);
    // Non-critical error - class completion was already recorded
  }
}

/**
 * Manually trigger class completion check
 *
 * Useful for:
 * - Admin operations that update scores in bulk
 * - Recovery from failed completion checks
 * - Testing and debugging
 *
 * @param classId - The class ID to check
 *
 * @example
 * // After bulk score import
 * await manuallyCheckClassCompletion(123);
 */
export async function manuallyCheckClassCompletion(classId: number): Promise<void> {
await updateSingleClassCompletion(classId);
}

/**
 * Update the local IndexedDB cache for a class directly without syncing from server.
 * This prevents race conditions where stale data from read replicas overwrites
 * our correct local changes.
 *
 * @param classId - The class ID to update in cache
 * @param updates - The fields to update
 */
async function updateLocalClassCache(
  classId: number,
  updates: { class_status?: string; is_scoring_finalized?: boolean }
): Promise<void> {
  try {
    const manager = getReplicationManager();
    if (!manager) {
      logger.warn('⚠️ [updateLocalClassCache] No replication manager - skipping cache update');
      return;
    }

    const classesTable = manager.getTable('classes');
    if (!classesTable) {
      logger.warn('⚠️ [updateLocalClassCache] Classes table not registered - skipping cache update');
      return;
    }

    // Get the current class from cache
    const currentClass = await classesTable.get(String(classId)) as Class | undefined;
    if (!currentClass) {
      logger.warn(`⚠️ [updateLocalClassCache] Class ${classId} not found in cache - skipping cache update`);
      return;
    }

    // Update the class with new values
    const updatedClass: Class = {
      ...currentClass,
      class_status: updates.class_status ?? currentClass.class_status,
      is_scoring_finalized: updates.is_scoring_finalized ?? currentClass.is_scoring_finalized,
      updated_at: new Date().toISOString()
    };

    // Write back to cache (not dirty - already synced to server)
    await classesTable.set(String(classId), updatedClass, false);

    logger.log(`✅ [updateLocalClassCache] Updated class ${classId} in cache:`, {
      class_status: updatedClass.class_status,
      is_scoring_finalized: updatedClass.is_scoring_finalized
    });
  } catch (error) {
    logger.error('❌ [updateLocalClassCache] Failed to update cache:', error);
    // Non-fatal - the DB write succeeded, cache will catch up on next sync
  }
}

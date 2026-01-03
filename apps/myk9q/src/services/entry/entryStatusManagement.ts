import { supabase } from '@/lib/supabase';
import { EntryStatus } from '@/stores/entryStore';
import { triggerImmediateEntrySync } from '../entryReplication';
import { checkAndUpdateClassCompletion } from './classCompletionService';
import { getReplicationManager } from '../replication/ReplicationManager';
import type { Entry } from '../replication/tables/ReplicatedEntriesTable';
import { logger } from '@/utils/logger';

/**
 * In-memory store for tracking previous entry statuses before entering ring.
 * This allows restoring the status when a scoresheet is canceled (wrong dog clicked).
 *
 * The Map is cleared when:
 * - Entry is scored (status becomes 'completed' anyway)
 * - Entry leaves ring and status is restored
 * - App refreshes (acceptable - user would re-open scoresheet)
 */
const previousStatusStore = new Map<number, EntryStatus>();

/**
 * Save an entry's status before marking it in-ring.
 * @param entryId - Entry ID
 * @param status - The status to save (before entering ring)
 */
export function savePreviousStatus(entryId: number, status: EntryStatus): void {
  previousStatusStore.set(entryId, status);
  logger.log(`💾 [savePreviousStatus] Saved status '${status}' for entry ${entryId}`);
}

/**
 * Get and clear the previous status for an entry.
 * @param entryId - Entry ID
 * @returns The saved status, or undefined if not found
 */
export function popPreviousStatus(entryId: number): EntryStatus | undefined {
  const status = previousStatusStore.get(entryId);
  previousStatusStore.delete(entryId);
  if (status) {
    logger.log(`📤 [popPreviousStatus] Retrieved and cleared status '${status}' for entry ${entryId}`);
  }
  return status;
}

/**
 * Entry Status Management Module
 *
 * Handles all entry status transitions and updates:
 * - In-ring status management (markInRing)
 * - Manual completion (markEntryCompleted)
 * - Check-in status updates (updateEntryCheckinStatus)
 * - Score reset (resetEntryScore)
 *
 * **Phase 2, Task 2.2** - Extracted from entryService.ts
 *
 * **Status Transitions**:
 * ```
 * no-status → checked-in → in-ring → completed
 *      ↑                        ↓
 *      └────── reset ───────────┘
 * ```
 *
 * **Design Principles**:
 * - Never overwrite completed status with lower status
 * - Always trigger immediate sync for UI updates
 * - Check class completion after status changes
 * - Preserve scored entries when resetting in-ring status
 */

/**
 * Check if in-ring status update should be skipped (already in desired state)
 * Extracted to reduce nesting depth (DEBT-009)
 */
async function shouldSkipInRingUpdate(entryId: number, inRing: boolean): Promise<boolean> {
  const manager = getReplicationManager();
  if (!manager) return false;

  const entriesTable = manager.getTable('entries');
  if (!entriesTable) return false;

  const cachedEntry = await entriesTable.get(String(entryId)) as Entry | undefined;
  if (!cachedEntry) return false;

  const currentlyInRing = cachedEntry.entry_status === 'in-ring';
  if (currentlyInRing !== inRing) return false;

   
  logger.log(`⏭️ [markInRing] Entry ${entryId} already ${inRing ? 'in-ring' : 'not in-ring'} - skipping DB call`);
  return true;
}

/**
 * Mark an entry as being in the ring (or remove from ring)
 *
 * **Business Rules**:
 * - When adding to ring: Changes 'no-status' → 'in-ring'
 * - When removing from ring:
 *   - If entry is scored: Keep as 'completed' (don't downgrade)
 *   - If entry not scored: Change 'in-ring' → 'no-status'
 *
 * **Use Cases**:
 * - Ring steward marks dog entering ring
 * - Ring steward marks dog exiting ring
 * - Automatic status management during scoring
 *
 * @param entryId - The entry ID to update
 * @param inRing - true = mark as in ring, false = remove from ring
 * @returns Promise<boolean> - true if successful
 *
 * @example
 * // Dog enters ring
 * await markInRing(123, true);
 *
 * @example
 * // Dog exits ring (preserves completed status if scored)
 * await markInRing(123, false);
 */
export async function markInRing(
  entryId: number,
  inRing: boolean = true,
  /** Optional: pass the current status when known (avoids cache lookup issues) */
  knownPreviousStatus?: EntryStatus
): Promise<boolean> {

  logger.log(`🏟️ [markInRing] Called with entryId=${entryId}, inRing=${inRing}, knownPreviousStatus=${knownPreviousStatus || 'not provided'}`);

  try {
    // OPTIMIZATION: Check local cache first to avoid redundant DB calls
    // This makes the function idempotent - multiple calls with same state are no-ops
    const skipUpdate = await shouldSkipInRingUpdate(entryId, inRing);
    if (skipUpdate) return true;

    // When removing from ring (inRing=false), check if entry is already scored
    // If scored, don't change status back to 'no-status' - keep it as 'completed'
    if (!inRing) {
      // Check if entry has a score (results merged into entries table)
      const { data: entry } = await supabase
        .from('entries')
        .select('is_scored')
        .eq('id', entryId)
        .maybeSingle();

      if (entry?.is_scored) {
        // Entry was scored - clear any saved previous status (no longer needed)
        popPreviousStatus(entryId);

        // Update to completed status instead of no-status
        // Also update is_in_ring for backward compatibility with deprecated field
        const { error } = await supabase
          .from('entries')
          .update({
            entry_status: 'completed',
            is_in_ring: false,  // CRITICAL: Also update deprecated field
            updated_at: new Date().toISOString()
          })
          .eq('id', entryId)
          .select();

        if (error) {
          logger.error('❌ markInRing database error:', error);
          throw error;
        }

         
        logger.log(`✅ [markInRing] Entry ${entryId} (scored) -> entry_status='completed', is_in_ring=false`);

        // CRITICAL FIX: Update local cache directly instead of syncing from server.
        // Syncing was causing race conditions where stale data from read replicas
        // would overwrite our correct local changes.
        await updateLocalCacheEntry(entryId, { entry_status: 'completed', is_in_ring: false });

        return true;
      }
    }

    // Determine the new status based on direction
    let newStatus: EntryStatus;

    if (inRing) {
      // ENTERING RING: Save current status before changing to 'in-ring'
      // This allows restoring when scoresheet is canceled (e.g., wrong dog clicked)

      // CRITICAL: Check if we already have a saved status for this entry.
      // This handles the race condition where EntryList saves the status first,
      // then the scoresheet also calls markInRing. We don't want to overwrite
      // the correct saved status with 'in-ring'.
      const existingSavedStatus = previousStatusStore.get(entryId);
      if (existingSavedStatus) {
        logger.log(`⚡ [markInRing] Entry ${entryId} already has saved status '${existingSavedStatus}' - keeping it (not overwriting with '${knownPreviousStatus || 'cache read'}')`);
      } else {
        // No saved status yet - determine what to save
        let currentStatus: EntryStatus;

        if (knownPreviousStatus) {
          // Use the provided status (caller knows it from entry data)
          currentStatus = knownPreviousStatus;
          logger.log(`💡 [markInRing] Using provided previousStatus: '${currentStatus}'`);
        } else {
          // Fall back to reading from cache (may be stale or missing)
          const manager = getReplicationManager();
          const entriesTable = manager?.getTable('entries');
          const currentEntry = await entriesTable?.get(String(entryId)) as Entry | undefined;
          currentStatus = (currentEntry?.entry_status as EntryStatus) || 'no-status';
          logger.log(`📖 [markInRing] Read status from cache: '${currentStatus}' (entry ${currentEntry ? 'found' : 'NOT found'})`);
        }

        // Only save if not already in-ring (shouldn't happen, but be safe)
        if (currentStatus !== 'in-ring') {
          savePreviousStatus(entryId, currentStatus);
        }
      }

      newStatus = 'in-ring';
    } else {
      // LEAVING RING (not scored): Restore previous status or default to 'no-status'
      const previousStatus = popPreviousStatus(entryId);
      newStatus = previousStatus || 'no-status';
      logger.log(`🔄 [markInRing] Restoring status for entry ${entryId}: ${previousStatus ? `'${previousStatus}'` : "'no-status' (no saved status)"}`);
    }

    // Also update is_in_ring for backward compatibility with deprecated field
    const { error } = await supabase
      .from('entries')
      .update({
        entry_status: newStatus,
        is_in_ring: inRing,  // CRITICAL: Also update deprecated field
        updated_at: new Date().toISOString()
      })
      .eq('id', entryId)
      .select();

    if (error) {
      logger.error('❌ markInRing database error:', error);
      throw error;
    }


    logger.log(`✅ [markInRing] Entry ${entryId} -> entry_status='${newStatus}', is_in_ring=${inRing}`);

    // CRITICAL FIX: Update local cache directly instead of syncing from server.
    // Syncing was causing race conditions where stale data from read replicas
    // would overwrite our correct local changes.
    await updateLocalCacheEntry(entryId, { entry_status: newStatus, is_in_ring: inRing });

    return true;
  } catch (error) {
    logger.error('❌ markInRing error:', error);
    throw error;
  }
}

/** Fields that can be updated in local cache */
interface LocalCacheEntryUpdates {
  entry_status?: string;
  is_in_ring?: boolean;
  // Score reset fields
  is_scored?: boolean;
  result_status?: string;
  final_placement?: number;
  search_time_seconds?: number;
  total_faults?: number;
  total_score?: number;
  points_earned?: number;
}

/**
 * Helper to update the local IndexedDB cache directly without syncing from server.
 * This prevents race conditions where stale data from read replicas overwrites
 * our correct local changes.
 */
async function updateLocalCacheEntry(
  entryId: number,
  updates: LocalCacheEntryUpdates
): Promise<void> {
  try {
    const manager = getReplicationManager();
    if (!manager) {
      logger.warn('⚠️ [updateLocalCacheEntry] No replication manager - skipping cache update');
      return;
    }

    const entriesTable = manager.getTable('entries');
    if (!entriesTable) {
      logger.warn('⚠️ [updateLocalCacheEntry] Entries table not registered - skipping cache update');
      return;
    }

    // Get the current entry from cache
    const currentEntry = await entriesTable.get(String(entryId)) as Entry | undefined;
    if (!currentEntry) {
      logger.warn(`⚠️ [updateLocalCacheEntry] Entry ${entryId} not found in cache - skipping cache update`);
      return;
    }

    // Update the entry with new values (only override if provided)
    const updatedEntry: Entry = {
      ...currentEntry,
      ...Object.fromEntries(
        Object.entries(updates).filter(([, value]) => value !== undefined)
      ),
      updated_at: new Date().toISOString()
    } as Entry;

    // Write back to cache (not dirty - already synced to server)
    await entriesTable.set(String(entryId), updatedEntry, false);


    logger.log(`✅ [updateLocalCacheEntry] Updated entry ${entryId} in cache:`, updates);
  } catch (error) {
    logger.error('❌ [updateLocalCacheEntry] Failed to update cache:', error);
    // Non-fatal - the DB write succeeded, cache will catch up on next sync
  }
}

/**
 * Mark an entry as completed without full scoring details
 *
 * **Use Case**: Manual completion by gate stewards when not using ringside scoring
 *
 * **Business Rules**:
 * - Only allows manual completion if entry is NOT already scored
 * - If entry has actual score data, this operation is skipped
 * - Sets result_status to 'manual_complete' to distinguish from scored entries
 *
 * **Status Changes**:
 * - entry_status: → 'completed'
 * - is_scored: → true
 * - result_status: → 'manual_complete'
 * - scoring_completed_at: → current timestamp
 *
 * @param entryId - The entry ID to mark as completed
 * @returns Promise<boolean> - true if successful
 *
 * @example
 * // Gate steward manually marks dog as complete
 * await markEntryCompleted(123);
 */
export async function markEntryCompleted(entryId: number): Promise<boolean> {
try {
    // Check if entry is already scored with actual data (results merged into entries table)
    const { data: existingEntry, error: checkError } = await supabase
      .from('entries')
      .select('id, is_scored')
      .eq('id', entryId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      logger.error('❌ Error checking existing entry:', checkError);
      throw checkError;
    }

    if (existingEntry && existingEntry.is_scored) {
      logger.warn('⚠️ Entry is already scored - skipping manual completion');
      return true; // Don't overwrite existing score
    }

    // Update the entry with completed status and score flag
    const { error: statusError } = await supabase
      .from('entries')
      .update({
        entry_status: 'completed',
        is_scored: true,
        result_status: 'manual_complete',
        scoring_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select();

    if (statusError) {
      logger.error('❌ markEntryCompleted database error:', statusError);
      throw statusError;
    }

return true;
  } catch (error) {
    logger.error('Error in markEntryCompleted:', error);
    throw error;
  }
}

/**
 * Update check-in status for an entry
 *
 * **Use Case**: Check-in desk operations
 *
 * **Status Values**:
 * - 'checked-in': Dog is present and ready
 * - 'absent': Dog did not show up
 * - 'withdrawn': Dog was withdrawn from class
 * - 'no-status': Initial state (not yet checked in)
 *
 * **Features**:
 * - Updates entry_status field
 * - Triggers immediate replication sync
 * - Includes write propagation delay (100ms) to prevent race conditions
 * - Verifies update by reading back
 *
 * @param entryId - The entry ID to update
 * @param checkinStatus - The new check-in status
 * @returns Promise<boolean> - true if successful
 *
 * @example
 * // Check in a dog
 * await updateEntryCheckinStatus(123, 'checked-in');
 *
 * @example
 * // Mark dog as absent
 * await updateEntryCheckinStatus(123, 'absent');
 */
export async function updateEntryCheckinStatus(
  entryId: number,
  checkinStatus: EntryStatus
): Promise<boolean> {
  try {
    // Update the unified entry_status field
    // CRITICAL: Include updated_at to trigger replication sync
    const updateData = {
      entry_status: checkinStatus,
      updated_at: new Date().toISOString(),
    };

const { error } = await supabase
      .from('entries')
      .update(updateData)
      .eq('id', entryId)
      .select();

    if (error) {
      logger.error('❌ Database error updating entry status:', error);
      logger.error('❌ Error details:', JSON.stringify(error, null, 2));
      logger.error('❌ Update data that failed:', updateData);
      throw new Error(
        `Database update failed: ${error.message || error.code || 'Unknown database error'}`
      );
    }

    // CRITICAL: Trigger immediate sync to update UI without refresh
    // This ensures the status change reflects in the replication cache immediately
    await triggerImmediateEntrySync('updateEntryCheckinStatus');

    // Small delay to ensure write has propagated (fixes immediate refresh race condition)
    await new Promise((resolve) => setTimeout(resolve, 100));
return true;
  } catch (error) {
    logger.error('Error in updateEntryCheckinStatus:', error);
    throw error;
  }
}

/**
 * Reset a dog's score and return them to pending status
 *
 * **Use Case**:
 * - Judge needs to rescore an entry
 * - Incorrect score was entered
 * - Entry was scored in wrong class
 *
 * **What Gets Reset**:
 * - is_scored → false
 * - result_status → 'pending'
 * - entry_status → 'no-status'
 * - All score fields (time, faults, placement, points) → 0/null
 * - Timestamps (scoring_completed_at, ring times) → null
 *
 * **Side Effects**:
 * - Triggers immediate replication sync
 * - Checks class completion status (class may become incomplete)
 *
 * @param entryId - The entry ID to reset
 * @returns Promise<boolean> - true if successful
 *
 * @example
 * // Reset entry to allow re-scoring
 * await resetEntryScore(123);
 */
export async function resetEntryScore(entryId: number): Promise<boolean> {
  try {
    // Get the class_id before resetting the score
    const { data: entryData } = await supabase
      .from('entries')
      .select('class_id, is_scored')
      .eq('id', entryId)
      .single();

    // CRITICAL: Unlock the entry first if it's scored
    // The protect_scored_entries trigger blocks changes to scoring fields
    // unless score_unlocked=TRUE (checked on OLD value, not NEW)
    if (entryData?.is_scored) {
      logger.log(`🔓 [resetEntryScore] Unlocking entry ${entryId} before reset`);
      const { error: unlockError } = await supabase
        .rpc('unlock_entry_for_edit', { p_entry_id: entryId });

      if (unlockError) {
        logger.error('❌ Failed to unlock entry for reset:', unlockError);
        throw new Error(`Failed to unlock entry: ${unlockError.message}`);
      }
    }

    // Reset score fields in the entries table (results merged into entries)
    // CRITICAL: Include updated_at to trigger replication sync
    const { error } = await supabase
      .from('entries')
      .update({
        is_scored: false,
        result_status: 'pending',
        entry_status: 'no-status', // Reset entry status when score is cleared
        search_time_seconds: 0,
        area1_time_seconds: 0,
        area2_time_seconds: 0,
        area3_time_seconds: 0,
        total_correct_finds: 0,
        total_incorrect_finds: 0,
        total_faults: 0,
        final_placement: 0,
        total_score: 0,
        points_earned: 0,
        scoring_completed_at: null,
        ring_entry_time: null,
        ring_exit_time: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId);

    if (error) {
      logger.error('❌ Database error resetting score:', {
        error,
        errorMessage: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        errorHint: error.hint,
        entryId,
      });
      throw new Error(
        `Database reset failed: ${error.message || error.code || 'Unknown database error'}`
      );
    }

// CRITICAL FIX: Update local cache directly instead of relying on sync.
    // The sync fetches from read replicas which may have stale 'completed' status
    // due to replication lag, overwriting our correct local changes.
    // MUST reset ALL score fields including final_placement to avoid showing stale values (e.g., 9990th)
    logger.log(`🔄 [resetEntryScore] Updating local cache for entry ${entryId} -> full score reset`);
    await updateLocalCacheEntry(entryId, {
      entry_status: 'no-status',
      is_in_ring: false,
      is_scored: false,
      result_status: 'pending',
      final_placement: 0,
      search_time_seconds: 0,
      total_faults: 0,
      total_score: 0,
      points_earned: 0
    });

    // Fire-and-forget sync for eventual consistency (other clients, background refresh)
    // Don't await - local cache already updated, sync runs in background
    triggerImmediateEntrySync('resetEntryScore').catch(err =>
      logger.warn('⚠️ [resetEntryScore] Background sync failed:', err)
    );

    // Fire-and-forget class completion check (non-blocking)
    // CRITICAL: Pass entryId as justResetEntryId to handle read replica lag
    // Without this, the read replica might still show the entry as scored,
    // causing the class to incorrectly stay on Completed tab
    if (entryData?.class_id) {
       
      logger.log(`🔄 [resetEntryScore] Triggering class completion check with justResetEntryId=${entryId}`);
      checkAndUpdateClassCompletion(entryData.class_id, undefined, undefined, entryId).catch(completionError =>
        logger.error('⚠️ Failed to check class completion:', completionError)
      );
    }

    return true;
  } catch (error) {
    logger.error('Error in resetEntryScore:', error);
    throw error;
  }
}

/**
 * Re-export types for convenience
 */
export type { EntryStatus } from '@/stores/entryStore';

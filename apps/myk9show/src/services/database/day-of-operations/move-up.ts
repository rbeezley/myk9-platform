/**
 * Move-Up Queries
 *
 * Database queries for move-up operations during day-of-show:
 * - Orchestrating move-ups (capacity check, mark original moved, insert new entry)
 * - Finding eligible entries for move-up
 * - Managing pending move-up requests (approve/deny)
 *
 * Status transitions (`entry_status='moved'`, rollback to 'confirmed', deny
 * to 'confirmed') route through `entries/lifecycle.ts`. This module retains
 * the orchestration role: capacity check, target-class lookup, new-entry
 * insert. Entry creation (the new row in the target class) stays here
 * because creation is not an `entry_status` transition.
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import {
  markEntryMoved,
  rollbackEntryMove,
  denyMoveUpRequest as denyMoveUpRequestTransition,
} from '../entries/lifecycle';
import { getReplicatedDayOfEntries } from './replicatedReadAdapter';

/**
 * Process a move-up request (move entry from one class to a higher class)
 */
export const processMoveUp = async (entryId: string, toClassId: string, reason?: string) => {
  const startTime = Date.now();

  try {
    // Get the current entry details
    const { data: currentEntry, error: fetchError } = await supabase
      .from('entries')
      .select(
        `
        id,
        dog_id,
        show_id,
        class_id,
        trial_id,
        jump_height,
        entry_fee,
        handler,
        armband
      `
      )
      .eq('id', entryId)
      .single();

    if (fetchError || !currentEntry) {
      throw createDatabaseError(
        fetchError || new Error('Entry not found'),
        'entries',
        'process_move_up_fetch'
      );
    }

    // Check capacity in target class
    const { count: acceptedCount } = await supabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', toClassId)
      .in('entry_status', ['confirmed', 'checked-in'])
      .is('deleted_at', null);

    const { data: targetClass } = await supabase
      .from('classes')
      .select('id, name, max_entries, trial_id')
      .eq('id', toClassId)
      .single();

    if (!targetClass) {
      throw new Error('Target class not found');
    }

    const limit = targetClass.max_entries || 999;
    if ((acceptedCount || 0) >= limit) {
      return { data: null, error: { message: 'Target class is full' } };
    }

    // Mark original entry as 'moved' via the lifecycle seam (audit-logged).
    const { error: updateError } = await markEntryMoved({
      entryId,
      targetClassName: targetClass.name,
      reason,
    });

    if (updateError) {
      throw createDatabaseError(updateError, 'entries', 'process_move_up_update');
    }

    // Create new entry in target class. INSERT is creation, not a transition,
    // so it stays on the direct Supabase write.
    const { data: newEntry, error: createError } = await supabase
      .from('entries')
      .insert({
        dog_id: currentEntry.dog_id,
        show_id: currentEntry.show_id,
        class_id: toClassId,
        trial_id: targetClass.trial_id,
        entry_status: 'confirmed',
        payment_status: 'waived', // Move-ups typically don't require additional fees
        entry_fee: 0,
        jump_height: currentEntry.jump_height,
        handler: currentEntry.handler,
        armband: currentEntry.armband,
        special_requests: `Moved up from class ${currentEntry.class_id}${reason ? ': ' + reason : ''}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select(
        `
        id,
        entry_status,
        handler,
        armband,
        dog:dog_id (
          id,
          name,
          call_name
        ),
        class:class_id (
          id,
          name,
          class_number
        )
      `
      )
      .single();

    if (createError) {
      // Rollback the original entry's status change via the lifecycle seam.
      await rollbackEntryMove(entryId);
      throw createDatabaseError(createError, 'entries', 'process_move_up_create');
    }

    const duration = Date.now() - startTime;
    logQuery('entries', 'process_move_up', duration);

    return { data: newEntry, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'process_move_up');
    logQuery('entries', 'process_move_up', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Get entries eligible for move-up (qualified in a lower class)
 */
export const getMoveUpEligibleEntries = async (showId: string) => {
  const startTime = Date.now();

  try {
    const data = await getReplicatedDayOfEntries(showId, ['confirmed', 'checked-in'], 'class-id');

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_move_up_eligible', duration);

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_move_up_eligible');
    logQuery('entries', 'get_move_up_eligible', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Get pending move-up requests for a show
 */
export const getPendingMoveUpRequests = async (showId: string) => {
  const startTime = Date.now();

  try {
    const data = await getReplicatedDayOfEntries(showId, ['move-up-requested'], 'created-asc');

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_pending_move_up_requests', duration);

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_pending_move_up_requests');
    logQuery('entries', 'get_pending_move_up_requests', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Approve a move-up request — orchestrates the move via `processMoveUp`.
 */
export const approveMoveUpRequest = async (entryId: string, toClassId: string, reason?: string) => {
  return processMoveUp(entryId, toClassId, reason);
};

/**
 * Deny a move-up request — re-exported from the lifecycle seam. Restores
 * `entry_status='confirmed'` (guarded by `entry_status='move-up-requested'`)
 * and records the denial reason in `special_requests`.
 */
export const denyMoveUpRequest = denyMoveUpRequestTransition;

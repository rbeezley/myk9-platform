/**
 * Move-Up Queries
 *
 * Database queries for move-up operations during day-of-show:
 * - Processing move-ups (moving entry to a higher class)
 * - Finding eligible entries for move-up
 * - Managing pending move-up requests (approve/deny)
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

/**
 * Process a move-up request (move entry from one class to a higher class)
 */
export const processMoveUp = async (
  entryId: string,
  toClassId: string,
  reason?: string
) => {
  const startTime = Date.now();

  try {
    // Get the current entry details
    const { data: currentEntry, error: fetchError } = await supabase
      .from('entries')
      .select(`
        id,
        dog_id,
        show_id,
        class_id,
        trial_id,
        jump_height,
        entry_fee,
        handler,
        armband
      `)
      .eq('id', entryId)
      .single();

    if (fetchError || !currentEntry) {
      throw createDatabaseError(fetchError || new Error('Entry not found'), 'entries', 'process_move_up_fetch');
    }

    // Check capacity in target class
    const { count: acceptedCount } = await supabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', toClassId)
      .in('entry_status', ['accepted', 'checked_in'])
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

    // Mark original entry as 'moved'
    const { error: updateError } = await supabase
      .from('entries')
      .update({
        entry_status: 'moved',
        special_requests: `Moved up to ${targetClass.name}${reason ? ': ' + reason : ''}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId);

    if (updateError) {
      throw createDatabaseError(updateError, 'entries', 'process_move_up_update');
    }

    // Create new entry in target class
    const { data: newEntry, error: createError } = await supabase
      .from('entries')
      .insert({
        dog_id: currentEntry.dog_id,
        show_id: currentEntry.show_id,
        class_id: toClassId,
        trial_id: targetClass.trial_id,
        entry_status: 'accepted',
        payment_status: 'waived', // Move-ups typically don't require additional fees
        entry_fee: 0,
        jump_height: currentEntry.jump_height,
        handler: currentEntry.handler,
        armband: currentEntry.armband,
        special_requests: `Moved up from class ${currentEntry.class_id}${reason ? ': ' + reason : ''}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select(`
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
      `)
      .single();

    if (createError) {
      // Rollback the status change if new entry fails
      await supabase
        .from('entries')
        .update({ entry_status: 'accepted', special_requests: null, updated_at: new Date().toISOString() })
        .eq('id', entryId);
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
    // Get entries that are accepted/checked-in and could move up
    const { data, error } = await supabase
      .from('entries')
      .select(`
        id,
        class_id,
        trial_id,
        entry_status,
        jump_height,
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
          class_number,
          trial_id
        )
      `)
      .eq('show_id', showId)
      .in('entry_status', ['accepted', 'checked_in'])
      .is('deleted_at', null)
      .order('class_id');

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_move_up_eligible', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'get_move_up_eligible');
    }

    return { data: data || [], error: null };
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
    // Get entries with move-up requests (entry_status = 'move_up_requested')
    const { data, error } = await supabase
      .from('entries')
      .select(`
        id,
        class_id,
        trial_id,
        entry_status,
        jump_height,
        special_requests,
        created_at,
        updated_at,
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
          class_number,
          trial_id
        )
      `)
      .eq('show_id', showId)
      .eq('entry_status', 'move_up_requested')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_pending_move_up_requests', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'get_pending_move_up_requests');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_pending_move_up_requests');
    logQuery('entries', 'get_pending_move_up_requests', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Approve a move-up request
 */
export const approveMoveUpRequest = async (
  entryId: string,
  toClassId: string,
  reason?: string
) => {
  // Use the existing processMoveUp function
  return processMoveUp(entryId, toClassId, reason);
};

/**
 * Deny a move-up request
 */
export const denyMoveUpRequest = async (
  entryId: string,
  reason?: string
) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_status: 'accepted', // Revert to accepted status
        special_requests: reason ? `Move-up denied: ${reason}` : 'Move-up request denied',
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .eq('entry_status', 'move_up_requested')
      .select(`
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
      `)
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'deny_move_up_request', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'deny_move_up_request');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'deny_move_up_request');
    logQuery('entries', 'deny_move_up_request', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

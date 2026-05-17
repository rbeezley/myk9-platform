/**
 * Scratch Queries
 *
 * Database queries for scratch and refund operations during day-of-show:
 * - Scratching entries
 * - Finding scratchable entries
 * - Getting scratched entries with refund info
 * - Managing scratch requests (request/approve/deny)
 * - Updating refund status
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

/**
 * Mark an entry as scratched
 */
export const scratchEntry = async (entryId: string, reason?: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_status: 'scratched',
        check_in_status: 'pulled',
        withdrawal_reason: reason || 'Pulled day-of',
        special_requests: reason || 'Pulled day-of',
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
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

    const duration = Date.now() - startTime;
    logQuery('entries', 'scratch_entry', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'scratch_entry');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'scratch_entry');
    logQuery('entries', 'scratch_entry', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Get entries eligible for scratching (accepted but not yet run)
 */
export const getScratchableEntries = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get entries that can be scratched
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
        id,
        class_id,
        trial_id,
        entry_status,
        jump_height,
        run_order,
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
      .eq('show_id', showId)
      .in('entry_status', ['confirmed', 'checked-in'])
      .is('deleted_at', null)
      .order('run_order', { ascending: true, nullsFirst: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_scratchable_entries', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'get_scratchable_entries');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_scratchable_entries');
    logQuery('entries', 'get_scratchable_entries', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Get scratched entries for a show with refund eligibility
 */
export const getScratchedEntries = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get scratched entries
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
        id,
        class_id,
        trial_id,
        entry_status,
        entry_fee,
        handler,
        armband,
        payment_status,
        special_requests,
        updated_at,
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
      .eq('show_id', showId)
      .eq('entry_status', 'scratched')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_scratched_entries', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'get_scratched_entries');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_scratched_entries');
    logQuery('entries', 'get_scratched_entries', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Request a scratch with reason
 */
export const requestScratch = async (entryId: string, reason?: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_status: 'scratch-requested',
        special_requests: reason || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select(
        `
        id,
        entry_status,
        entry_fee,
        handler,
        armband,
        payment_status,
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

    const duration = Date.now() - startTime;
    logQuery('entries', 'request_scratch', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'request_scratch');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'request_scratch');
    logQuery('entries', 'request_scratch', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Get pending scratch requests (entries requesting to scratch)
 */
export const getPendingScratchRequests = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get entries with scratch-requested status
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
        id,
        class_id,
        trial_id,
        entry_status,
        entry_fee,
        special_requests,
        created_at,
        handler,
        armband,
        payment_status,
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
      .eq('show_id', showId)
      .eq('entry_status', 'scratch-requested')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_pending_scratch_requests', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'get_pending_scratch_requests');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_pending_scratch_requests');
    logQuery('entries', 'get_pending_scratch_requests', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Approve a scratch request
 * Note: Refund processing should be handled separately via payment service
 */
export const approveScratchRequest = async (
  entryId: string,
  _processRefund?: boolean,
  _refundAmount?: number
) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_status: 'scratched',
        check_in_status: 'pulled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .eq('entry_status', 'scratch-requested')
      .select(
        `
        id,
        entry_status,
        check_in_status,
        entry_fee,
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

    const duration = Date.now() - startTime;
    logQuery('entries', 'approve_scratch_request', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'approve_scratch_request');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'approve_scratch_request');
    logQuery('entries', 'approve_scratch_request', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Deny a scratch request
 */
export const denyScratchRequest = async (entryId: string, reason?: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_status: 'confirmed',
        special_requests: reason ? `Pull denied: ${reason}` : 'Pull request denied',
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .eq('entry_status', 'scratch-requested')
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'deny_scratch_request', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'deny_scratch_request');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'deny_scratch_request');
    logQuery('entries', 'deny_scratch_request', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Update refund status for a scratched entry
 */
export const updateRefundStatus = async (
  entryId: string,
  refundStatus: string,
  refundAmount: number
) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        refund_status: refundStatus,
        refund_amount: refundAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'update_refund_status', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'update_refund_status');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'update_refund_status');
    logQuery('entries', 'update_refund_status', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

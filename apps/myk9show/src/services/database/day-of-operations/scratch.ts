/**
 * Scratch Queries
 *
 * Database queries for scratch and refund operations during day-of-show:
 * - Finding scratchable entries (eligibility)
 * - Getting scratched entries with refund info
 * - Pending scratch request queues
 * - Updating refund status
 *
 * Status transitions (day-of pull, scratch-request approve/deny) live in
 * `entries/lifecycle.ts` — this module re-exports them so existing callers
 * (`pages/secretary/DayOfOperationsPage`, `components/entries/PullManagementTab`)
 * keep their import paths.
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { TablesUpdate } from '@/types/supabase';

/**
 * Day-of pull — re-exported from the canonical lifecycle seam. The lifecycle
 * version writes `entry_status='scratched'`, `check_in_status='pulled'`,
 * `withdrawal_reason`, and `special_requests`, and emits an audit log entry.
 *
 * Re-exported under the existing `scratchEntry` name so day-of callers
 * (`pages/secretary/DayOfOperationsPage/index.tsx`,
 * `pages/secretary/DayOfOperationsPage/PullDialog.tsx`) keep their imports.
 */
export { scratchEntryDayOf as scratchEntry } from '../entries/lifecycle';

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
 * Exhibitor-initiated scratch request — re-exported from the lifecycle seam.
 * Writes `entry_status='scratch-requested'` and stores the reason in
 * `special_requests` so it's visible in the secretary's pull queue UI.
 */
export { requestScratch } from '../entries/lifecycle';

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
 * Approve a scratch request — re-exported from the lifecycle seam. Refund
 * processing is handled separately by the payment service.
 */
export { approveScratchRequest } from '../entries/lifecycle';

/**
 * Deny a scratch request — re-exported from the lifecycle seam.
 */
export { denyScratchRequest } from '../entries/lifecycle';

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
    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('registration_id')
      .eq('id', entryId)
      .single();

    if (entryError) {
      throw createDatabaseError(entryError, 'entries', 'select_refund_registration');
    }

    if (!entry.registration_id) {
      throw new Error(`Entry ${entryId} has no registration for refund tracking`);
    }

    const updateData: TablesUpdate<'enrollments'> = {
      refund_amount: refundAmount,
    };

    if (refundStatus === 'processed') {
      updateData.refunded_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('enrollments')
      .update(updateData)
      .eq('id', entry.registration_id)
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

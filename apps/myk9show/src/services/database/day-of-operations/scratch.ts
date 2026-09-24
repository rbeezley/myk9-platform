/**
 * Pull Queries
 *
 * Database queries for pull operations during day-of-show:
 * - Finding pullable entries (eligibility)
 * - Getting pulled entries
 * - Updating refund status
 *
 * Status transitions (day-of pull) live in `entries/lifecycle.ts`. There is no
 * pull-request queue: a pull is the exhibitor's own act (MYK9-632, MYK9-609).
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { TablesUpdate } from '@/types/supabase';
import { getReplicatedDayOfEntries } from './replicatedReadAdapter';

/**
 * Day-of pull — re-exported from the canonical lifecycle seam. The lifecycle
 * version writes `entry_status='scratched'`, `check_in_status='pulled'`,
 * `withdrawal_reason`, and `special_requests`, and emits an audit log entry.
 */
export { pullEntryDayOf as pullEntry } from '../entries/lifecycle';

/**
 * Get entries eligible for pulling (accepted but not yet run)
 */
export const getPullableEntries = async (showId: string) => {
  const startTime = Date.now();

  try {
    const data = await getReplicatedDayOfEntries(showId, ['confirmed', 'checked-in'], 'run-order');

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_pullable_entries', duration);

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_pullable_entries');
    logQuery('entries', 'get_pullable_entries', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Get pulled entries for a show
 */
export const getPulledEntries = async (showId: string) => {
  const startTime = Date.now();

  try {
    const data = await getReplicatedDayOfEntries(showId, ['scratched'], 'updated-desc');

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_pulled_entries', duration);

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_pulled_entries');
    logQuery('entries', 'get_pulled_entries', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Update refund status for a pulled entry
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

/**
 * Move-Up Queries
 *
 * Day-of-show read queries for the move-up workflow:
 * - Finding eligible entries for move-up
 * - Listing pending move-up requests
 *
 * The move-up *mutation* (capacity check, mark original `moved`, insert the
 * new row, offline-safe rollback) lives in the live Show Map path,
 * `features/show-map/showMapActionMutations.ts:moveUpShowMapEntry`, which
 * writes through the replication layer. Denial (`entry_status` back to
 * 'confirmed') routes through `entries/lifecycle.ts` and is re-exported here.
 */

import { logQuery, createDatabaseError } from '../supabaseClient';
import { denyMoveUpRequest as denyMoveUpRequestTransition } from '../entries/lifecycle';
import { getReplicatedDayOfEntries } from './replicatedReadAdapter';

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
 * Deny a move-up request — re-exported from the lifecycle seam. Restores
 * `entry_status='confirmed'` (guarded by `entry_status='move-up-requested'`)
 * and records the denial reason in `special_requests`.
 */
export const denyMoveUpRequest = denyMoveUpRequestTransition;

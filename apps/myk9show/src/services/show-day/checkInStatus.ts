import type { CheckInStatus } from '@myk9/core';
import { createDatabaseError, supabase } from '@/services/database/supabaseClient';
import { updateEntryStatus } from '@/services/database/entries/secretary';
import { replicatedEntriesTable, type ReplicatedEntry } from '@/services/replication';
import { logReplicatedEntryStatusChange } from './entryStatusAudit';

/**
 * Which authorization path a check-in write takes:
 *  - `'replicated'`     → `ringside_update_entry` / direct UPDATE, authorized by
 *                         staff role (manager / judge / steward). Offline-first.
 *  - `'self-checkin-rpc'` → `self_checkin_entry`, authorized by dog ownership
 *                         (handler / owner / co-owner). Online-only by design.
 */
export type CheckInWriter = 'replicated' | 'self-checkin-rpc';

export async function updateReplicatedCheckInStatus(
  entryId: string,
  status: CheckInStatus,
  updates: Partial<ReplicatedEntry> = {}
): Promise<string | null> {
  if (Object.keys(updates).length === 0) {
    return replicatedEntriesTable.updateCheckInStatus(entryId, status);
  }

  return replicatedEntriesTable.updateEntry(entryId, {
    ...updates,
    checkInStatus: status,
    check_in_status: status,
  });
}

export async function updateSelfCheckInStatus(
  entryId: string,
  status: CheckInStatus
): Promise<void> {
  const { error } = await supabase.rpc('self_checkin_entry', {
    p_entry_id: entryId,
    p_new_status: status,
  });

  if (error) {
    throw createDatabaseError(error, 'entries', 'self_checkin_entry');
  }
}

/**
 * Show Day's "Pull / no-show" fast path. MYK9-918: it is the SAME mutation as
 * Entry Management's Pull (`updateEntryStatus` → `buildReplicatedEntryStatusUpdate`),
 * so both write identical fields — `scratched`, `check_in_status='pulled'`, the
 * reason in `withdrawal_reason`, `withdrawal_reason_code` cleared — and neither
 * overwrites the exhibitor's `special_requests`.
 */
export async function updateReplicatedDayOfScratch(
  entryId: string,
  reason: string
): Promise<string | null> {
  const { data, error } = await updateEntryStatus(entryId, 'scratched', reason);
  if (error) throw error;

  await logReplicatedEntryStatusChange({
    entryId,
    toStatus: 'scratched',
    action: 'scratch_entry_day_of',
    reason,
    metadata: { checkInStatus: 'pulled' },
  });

  return data?.mutationId ?? null;
}

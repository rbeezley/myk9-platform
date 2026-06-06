import type { CheckInStatus } from '@myk9/core';
import { createDatabaseError, supabase } from '@/services/database/supabaseClient';
import { replicatedEntriesTable, type ReplicatedEntry } from '@/services/replication';
import { logReplicatedEntryStatusChange } from './entryStatusAudit';

export interface ReplicatedDayOfScratchOptions {
  auditAction?: string | undefined;
  fromStatus?: string | null | undefined;
}

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

export async function updateReplicatedDayOfScratch(
  entryId: string,
  reason: string,
  options: ReplicatedDayOfScratchOptions = {}
): Promise<string | null> {
  const mutationId = await replicatedEntriesTable.updateEntry(entryId, {
    entryStatus: 'scratched',
    entry_status: 'scratched',
    checkInStatus: 'pulled',
    check_in_status: 'pulled',
    withdrawalReason: reason,
    withdrawal_reason: reason,
    specialRequests: reason,
    special_requests: reason,
  });

  await logReplicatedEntryStatusChange({
    entryId,
    fromStatus: options.fromStatus,
    toStatus: 'scratched',
    action: options.auditAction ?? 'scratch_entry_day_of',
    reason,
    metadata: { checkInStatus: 'pulled' },
  });

  return mutationId;
}

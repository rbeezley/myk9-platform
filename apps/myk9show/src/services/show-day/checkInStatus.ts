import type { CheckInStatus } from '@myk9/core';
import { replicatedEntriesTable } from '@/services/replication';

export async function updateReplicatedCheckInStatus(
  entryId: string,
  status: CheckInStatus
): Promise<string | null> {
  return replicatedEntriesTable.updateCheckInStatus(entryId, status);
}

export async function updateReplicatedDayOfScratch(
  entryId: string,
  reason: string
): Promise<string | null> {
  return replicatedEntriesTable.updateEntry(entryId, {
    entryStatus: 'scratched',
    entry_status: 'scratched',
    checkInStatus: 'pulled',
    check_in_status: 'pulled',
    withdrawalReason: reason,
    withdrawal_reason: reason,
    specialRequests: reason,
    special_requests: reason,
  });
}

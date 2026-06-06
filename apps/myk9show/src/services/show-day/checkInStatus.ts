import type { CheckInStatus } from '@myk9/core';
import {
  replicatedEntriesTable,
  type ReplicatedEntry,
} from '@/services/replication/ReplicatedEntriesTable';

export async function updateReplicatedCheckInStatus(
  entryId: string,
  status: CheckInStatus,
  updates: Partial<ReplicatedEntry> = {}
): Promise<void> {
  await replicatedEntriesTable.updateEntry(entryId, {
    ...updates,
    checkInStatus: status,
    check_in_status: status,
  });
}

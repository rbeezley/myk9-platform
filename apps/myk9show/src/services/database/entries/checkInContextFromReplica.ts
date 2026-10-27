import type { CheckInStatus } from '@myk9/core';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import type { EntryStatus } from '@/types/entry-lifecycle';
import type { EntryStatusCheckInContext } from './statusCheckIn';

/**
 * MYK9-1396: fill in the stored Pull prior an un-pull needs from the replicated
 * row, so every caller (Entry Management, Show Day, Show Map) restores it
 * without each having to pass it. Caller-supplied values win; the replica is
 * read only when a value is genuinely missing, so a plain confirm does no extra
 * read. Reading only: the database trigger owns the column and the replica row
 * mirrors it locally on a Pull.
 */
export async function withReplicaCheckInContext(
  entryId: string,
  status: EntryStatus,
  context: EntryStatusCheckInContext | undefined
): Promise<EntryStatusCheckInContext | undefined> {
  const needsStored =
    status !== 'scratched' &&
    context?.previousEntryStatus === 'scratched' &&
    context.priorCheckInStatus === undefined &&
    context.storedCheckInStatusBeforePull === undefined;
  if (!needsStored) return context;

  const row = await replicatedEntriesTable.getEntryById(entryId);
  if (!row) return context;

  return {
    ...context,
    storedCheckInStatusBeforePull: (row.checkInStatusBeforePull ??
      row.check_in_status_before_pull ??
      null) as CheckInStatus | null,
  };
}

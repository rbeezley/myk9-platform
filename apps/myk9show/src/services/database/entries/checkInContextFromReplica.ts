import type { CheckInStatus } from '@myk9/core';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import type { EntryStatus } from '@/types/entry-lifecycle';
import type { EntryStatusCheckInContext } from './statusCheckIn';

/**
 * MYK9-1396: fill in the check-in facts a Pull or un-pull needs from the
 * replicated row, so every caller (Entry Management, Show Day, Show Map) stores
 * and restores the prior without each having to pass it. Caller-supplied values
 * win; the replica is read only when a value is genuinely missing, so a plain
 * confirm does no extra read.
 */
export async function withReplicaCheckInContext(
  entryId: string,
  status: EntryStatus,
  context: EntryStatusCheckInContext | undefined
): Promise<EntryStatusCheckInContext | undefined> {
  const needsCurrent = status === 'scratched' && context?.currentCheckInStatus === undefined;
  const needsStored =
    status !== 'scratched' &&
    context?.previousEntryStatus === 'scratched' &&
    context.priorCheckInStatus === undefined &&
    context.storedCheckInStatusBeforePull === undefined;
  if (!needsCurrent && !needsStored) return context;

  const row = await replicatedEntriesTable.getEntryById(entryId);
  if (!row) return context;

  return {
    ...context,
    ...(needsCurrent
      ? { currentCheckInStatus: (row.checkInStatus ?? row.check_in_status) as CheckInStatus }
      : {}),
    ...(needsStored
      ? {
          storedCheckInStatusBeforePull: (row.checkInStatusBeforePull ??
            row.check_in_status_before_pull ??
            null) as CheckInStatus | null,
        }
      : {}),
  };
}

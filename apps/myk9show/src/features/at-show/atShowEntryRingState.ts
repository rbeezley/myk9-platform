import type { EntryStatus } from '@myk9/core';
// The run-queue subpath, not replicatedRunQueue, which would pull the ringside UI barrel into
// the entry chunk (entryChunkSplit.test.ts).
import { isInRingEntry } from '@myk9/ringside/run-queue';
import { isNonRunningEntry, isRunnableEntry } from '@/features/_shared/entryAccounting';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

/**
 * A replicated entry's ringside check-in status and in-ring flag.
 *
 * Status: a row nobody expects to run is 'pulled' even if it carries a stale 'in-ring'
 * check-in, the same ordering the run queue uses (toRunQueueEntry, MYK9-645).
 *
 * In ring: the shared rule (MYK9-1892), runnable and (is_in_ring or check-in 'in-ring'),
 * never ring_entry_time.
 */
export function ringsideEntryRingState(re: ReplicatedEntry): {
  status: EntryStatus;
  inRing: boolean;
  /**
   * The entry lifecycle (scratched, withdrawn, absent) says the dog will not run. `status` reads
   * Pulled for it whatever the check-in column holds, so a check-in change cannot bring it back;
   * only the secretary reinstating the entry can (MYK9-1809).
   */
  notRunning: boolean;
} {
  const checkinStatus = re.checkInStatus ?? re.check_in_status;
  const lifecycleStatus = re.entryStatus ?? re.entry_status ?? re.status;
  const notRunning = isNonRunningEntry({ entryStatus: lifecycleStatus });
  const status: EntryStatus = (
    checkinStatus === 'pulled' || notRunning ? 'pulled' : (checkinStatus ?? 'no-status')
  ) as EntryStatus;
  const inRing =
    isRunnableEntry(re) &&
    isInRingEntry({
      id: re.id,
      armband: null,
      status,
      inRing: (re.isInRing ?? re.is_in_ring ?? false) === true,
    });
  return { status, inRing, notRunning };
}

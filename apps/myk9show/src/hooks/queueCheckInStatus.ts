import { isRunnableEntry } from '@/features/_shared/entryAccounting';
import type { ShowEntry } from '@/store/entry-store-types';

/** One row of the notification snapshot's entry read. */
export interface NotificationEntryRow {
  id: string;
  dog_id: string;
  class_id: string;
  show_id: string;
  check_in_status: string | null;
  armband: string | null;
  is_scored: boolean | null;
  result_status: string | null;
  dog_call_name: string | null;
  run_order?: number | null;
  entry_status?: string | null;
  is_in_ring?: boolean | null;
  deleted_at?: string | null;
}

/**
 * The check-in status the shared run queue reads (MYK9-1941). Whether the dog
 * still runs is `isRunnableEntry`'s call, the same predicate behind the
 * ringside run list, so a withdrawn, moved, pulled, scored or deleted row is
 * `pulled` here and never counted ahead. Only a runnable row can be in the ring.
 */
export function queueCheckInStatus(
  row: NotificationEntryRow
): ShowEntry['checkInStatus'] | undefined {
  const runnable = isRunnableEntry({
    deleted_at: row.deleted_at,
    entry_status: row.entry_status ?? undefined,
    check_in_status: row.check_in_status ?? undefined,
    is_scored: row.is_scored ?? undefined,
    result_status: row.result_status ?? undefined,
  });
  if (!runnable) return 'pulled';
  if (row.is_in_ring) return 'in-ring';
  return (row.check_in_status as ShowEntry['checkInStatus']) ?? undefined;
}

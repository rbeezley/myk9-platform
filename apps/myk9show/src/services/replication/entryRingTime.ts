import type { ReplicatedEntry } from './ReplicatedEntriesTable.mapper';

/** Check-in statuses during or after a run; any other status means the dog has not run. */
const RUN_STATUSES: ReadonlySet<string> = new Set(['in-ring', 'completed']);

/**
 * MYK9-1761: the extra field a check-in write must carry so an unscored dog moved off the
 * ring (back to a pre-run status, a conflict or a pull) loses the ring_entry_time stamped
 * when the judge started its run (Start on the scoresheet, MYK9-1779). Show Map, hand placement and move-up supersession all read
 * that stamp as "in the ring / run started".
 *
 * The one rule for every entries-table write that sets a check-in status, so no screen
 * can bypass it. A score reset counts too (MYK9-1778): it unscores the dog, so it is judged
 * on the row AFTER the write, and on the status the dog keeps when the reset leaves it alone.
 * Returns `{}` when nothing should change: a run status, a write that sets ring_entry_time
 * itself, a dog still scored after the write, or no stamp to clear.
 */
export function staleRingTimeClear(
  row:
    | Pick<
        ReplicatedEntry,
        'ring_entry_time' | 'isScored' | 'is_scored' | 'checkInStatus' | 'check_in_status'
      >
    | null
    | undefined,
  nextStatus: string | null | undefined,
  updates: Partial<ReplicatedEntry> = {}
): Pick<ReplicatedEntry, 'ring_entry_time'> {
  const unscores = (updates.isScored ?? updates.is_scored) === false;
  const status = nextStatus ?? (unscores ? (row?.checkInStatus ?? row?.check_in_status) : null);
  if (!status || RUN_STATUSES.has(status)) return {};
  if ('ring_entry_time' in updates) return {};
  const scoredAfter = unscores ? false : (row?.isScored ?? row?.is_scored);
  if (!row?.ring_entry_time || scoredAfter) return {};
  return { ring_entry_time: undefined };
}

/** The server-side form of a clear: the column set to null in a payload or RPC fields. */
export function ringTimeClearPayload(clear: Pick<ReplicatedEntry, 'ring_entry_time'>): {
  ring_entry_time?: null;
} {
  return 'ring_entry_time' in clear ? { ring_entry_time: null } : {};
}

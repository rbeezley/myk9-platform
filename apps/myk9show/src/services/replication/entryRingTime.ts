import type { ReplicatedEntry } from './ReplicatedEntriesTable.mapper';

/** Check-in statuses during or after a run; any other status means the dog has not run. */
const RUN_STATUSES: ReadonlySet<string> = new Set(['in-ring', 'completed']);

/**
 * MYK9-1761: the extra field a check-in write must carry so an unscored dog moved off the
 * ring (back to a pre-run status, a conflict or a pull) loses the ring_entry_time stamped
 * when its scoresheet opened. Show Map, hand placement and move-up supersession all read
 * that stamp as "in the ring / run started".
 *
 * The one rule for every entries-table write that sets a check-in status, so no screen
 * can bypass it. Returns `{}` when nothing should change: a run status, a write that sets
 * ring_entry_time itself, a scored dog, or no stamp to clear.
 */
export function staleRingTimeClear(
  row: Pick<ReplicatedEntry, 'ring_entry_time' | 'isScored' | 'is_scored'> | null | undefined,
  nextStatus: string | null | undefined,
  updates: Partial<ReplicatedEntry> = {}
): Pick<ReplicatedEntry, 'ring_entry_time'> {
  if (!nextStatus || RUN_STATUSES.has(nextStatus)) return {};
  if ('ring_entry_time' in updates) return {};
  if (!row?.ring_entry_time || (row.isScored ?? row.is_scored)) return {};
  return { ring_entry_time: undefined };
}

/** The server-side form of a clear: the column set to null in a payload or RPC fields. */
export function ringTimeClearPayload(clear: Pick<ReplicatedEntry, 'ring_entry_time'>): {
  ring_entry_time?: null;
} {
  return 'ring_entry_time' in clear ? { ring_entry_time: null } : {};
}

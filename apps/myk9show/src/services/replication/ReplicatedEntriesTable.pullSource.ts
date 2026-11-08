import type { ReplicatedEntry } from './ReplicatedEntriesTable.mapper';

/**
 * MYK9-1757: `check_in_pulled_by` is stamped by the SERVER when check_in_status moves to
 * 'pulled'. A local write that changes check_in_status makes the replica's copy of that stamp
 * stale (a clear then a re-flag offline would otherwise keep crediting the earlier flagger), so
 * the one place that builds the optimistic row forgets it: null reads as unknown ("Flagged as
 * pulled.") until the server's stamp arrives on the next sync. A write that leaves the status
 * alone (or re-pulls an already pulled row, where the server keeps its stamp) keeps it.
 *
 * Applied to the LOCAL row only. The column is never part of `entryToSupabaseRow`, so it can
 * not reach a mutation payload; the trigger owns it.
 */
export function withPullSourceInvalidated(
  before: ReplicatedEntry,
  after: ReplicatedEntry
): ReplicatedEntry {
  const from = before.checkInStatus ?? before.check_in_status;
  const to = after.checkInStatus ?? after.check_in_status;
  if (from === to) return after;
  return { ...after, checkInPulledBy: null, check_in_pulled_by: null };
}

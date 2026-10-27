import type { CheckInStatus } from '@myk9/core';
import type { ReplicatedEntry } from './ReplicatedEntriesTable.mapper';

/**
 * MYK9-1396: the LOCAL mirror of `trg_entries_check_in_before_pull`.
 *
 * The database trigger is the only writer of `check_in_status_before_pull`; no
 * upload payload carries it. But a Pull then Accept can happen before the
 * server's stamp syncs down (offline, or a quick second click), so the replica
 * row mirrors the trigger's rule in the same step as the local write:
 *
 * - moving to `pulled` from anything else remembers the old check-in;
 * - moving off `pulled` forgets it;
 * - anything else (re-pull, unrelated edit) keeps what the row already holds.
 *
 * Apply to the LOCAL row only. A row the server later sends carries the server's
 * own stamp and replaces this one (clean rows take the remote in `resolveConflict`).
 */
export function mirrorCheckInBeforePull(
  before: ReplicatedEntry,
  after: ReplicatedEntry
): ReplicatedEntry {
  const oldStatus = before.checkInStatus ?? before.check_in_status;
  const newStatus = after.checkInStatus ?? after.check_in_status;
  if (newStatus === undefined || newStatus === oldStatus) return after;

  const stored = before.checkInStatusBeforePull ?? before.check_in_status_before_pull ?? null;
  let next: CheckInStatus | null = stored;
  if (newStatus === 'pulled' && oldStatus !== 'pulled') next = oldStatus ?? null;
  else if (oldStatus === 'pulled' && newStatus !== 'pulled') next = null;

  return { ...after, checkInStatusBeforePull: next, check_in_status_before_pull: next };
}

import type { ReplicatedEntry } from './ReplicatedEntriesTable.mapper';

/**
 * The detailed scent-work scoring columns, cleared to null. Spread into EVERY
 * reset-score `updateEntry` payload so a reset doesn't leave stale per-area
 * times / find counts / points on the entry (they'd otherwise persist until the
 * next full score overwrites them, showing wrong detail in secretary reports).
 * All columns are ringside-RPC-whitelisted, so the reset still routes correctly.
 */
export const SCORE_DETAIL_CLEAR_FIELDS: Partial<ReplicatedEntry> = {
  area1_time_seconds: null,
  area2_time_seconds: null,
  area3_time_seconds: null,
  area4_time_seconds: null,
  total_correct_finds: null,
  total_incorrect_finds: null,
  no_finish_count: null,
  points_earned: null,
};

/**
 * The check-in columns a score reset must also write (MYK9-1737). Scoring sets
 * `check_in_status = 'completed'` (`transitionToCompleted`), and both the
 * entry-list badge and the run queue (`runQueueStateOf` treats `completed` as
 * done) read that column, not `is_scored`. A completed dog ran, so it was
 * here: it goes back to `checked-in`. Every other status (pulled, conflict, in-ring, ...) is a fact
 * about the dog that a score reset does not change, so it is left alone.
 *
 * Call it inside `replicatedEntriesTable.updateEntryWith`, so it reads the
 * row the write is based on (hydrated on a cold replica) and lands in the
 * SAME payload as the score clear. Both columns are ringside-RPC-whitelisted.
 */
export function scoreResetCheckInFields(
  current: Pick<ReplicatedEntry, 'checkInStatus' | 'check_in_status'>
): Partial<ReplicatedEntry> {
  const status = current.checkInStatus ?? current.check_in_status;
  if (status !== 'completed') return {};
  return { checkInStatus: 'checked-in', check_in_status: 'checked-in' };
}

import { createDatabaseError } from '@/services/database/supabaseClient';
import { parseMovedUpFromClassId } from '@/services/database/entries/moveUpNote';
import { replicatedClassesTable, replicatedEntriesTable } from '@/services/replication';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';

/**
 * Why a move-up cannot be reversed right now, in the words the dialog shows.
 *
 * `not-a-move-up` is not an error — it is the ordinary answer for every entry
 * that was never moved, and the control simply is not offered.
 */
export type MoveUpReversalBlockedReason = 'not-a-move-up' | 'source-missing' | 'run-started';

export interface MoveUpReversal {
  destinationEntryId: string;
  sourceEntryId: string;
  sourceClassId: string | null;
  sourceClassName: string | null;
}

export type MoveUpReversalState =
  | ({ kind: 'available' } & MoveUpReversal)
  | { kind: 'blocked'; reason: MoveUpReversalBlockedReason };

function readEntryStatusOf(entry: Partial<ReplicatedEntry> | null | undefined): string | null {
  return entry?.entryStatus ?? entry?.entry_status ?? entry?.status ?? null;
}

function isNonZero(value: number | null | undefined): boolean {
  return typeof value === 'number' && value !== 0;
}

/**
 * True once the run has STARTED in the destination class — not merely "has a
 * final result".
 *
 * The distinction is the finding: a dog standing in the ring with two area
 * times recorded has `is_scored === false` and `result_status === 'pending'`, so
 * a result-only guard would offer Move back and soft-delete the row the judge is
 * scoring into, taking their work with it.
 *
 * `result_status` defaults to `'pending'`, so it is compared rather than tested
 * for presence — otherwise every untouched entry would read as started. This
 * mirrors the SQL guard in `reverse_move_up_entry`, which is the one that
 * actually enforces it; this copy exists so the dialog can explain itself
 * before the secretary presses anything.
 */
export function hasRunStarted(entry: Partial<ReplicatedEntry>): boolean {
  const resultStatus = entry.resultStatus ?? entry.result_status;
  const checkIn = entry.checkInStatus ?? entry.check_in_status;
  return (
    entry.isScored === true ||
    entry.is_scored === true ||
    entry.isInRing === true ||
    entry.is_in_ring === true ||
    checkIn === 'in-ring' ||
    checkIn === 'completed' ||
    Boolean(entry.scoringCompletedAt ?? entry.scoring_completed_at) ||
    Boolean(entry.ring_entry_time) ||
    (typeof resultStatus === 'string' && resultStatus !== 'pending') ||
    entry.finalPlacement != null ||
    entry.final_placement != null ||
    isNonZero(entry.points_earned) ||
    isNonZero(entry.searchTimeSeconds ?? entry.search_time_seconds) ||
    isNonZero(entry.area1_time_seconds) ||
    isNonZero(entry.area2_time_seconds) ||
    isNonZero(entry.area3_time_seconds) ||
    isNonZero(entry.area4_time_seconds)
  );
}

/**
 * Find the entry a move-up superseded, so the secretary can be offered the way
 * back (MYK9-640).
 *
 * READ-ONLY, and answered from the replica so it works offline even though the
 * reversal itself does not. TWO links, in order:
 *
 *  1. `moved_from_entry_id` on the destination — the one the server writes and
 *     the one `reverse_move_up_entry` follows.
 *  2. the `"Moved up from class <id>"` note in `special_requests`, matched back
 *     to the one `moved` entry for this dog in that class.
 *
 * The second is READ-ONLY legacy support: nothing writes a pair without the FK
 * any more, and there are ZERO rows with `entry_status = 'moved'` on the live
 * database today, so it exists only for a demo/staging pair recorded by the old
 * code. The server refuses to reverse such a pair (it has no FK to follow), so
 * this resolver reports it as available only when the FK is present.
 */
export async function resolveMoveUpReversal(
  destinationEntryId: string
): Promise<MoveUpReversalState> {
  const destination = await replicatedEntriesTable.getEntryById(destinationEntryId);
  if (!destination) return { kind: 'blocked', reason: 'not-a-move-up' };

  const linkedSourceId = destination.movedFromEntryId ?? destination.moved_from_entry_id ?? null;
  const notedSourceClassId = parseMovedUpFromClassId(
    destination.specialRequests ?? destination.special_requests
  );
  if (!linkedSourceId && !notedSourceClassId) {
    return { kind: 'blocked', reason: 'not-a-move-up' };
  }

  // Ordered after the "is this even a move-up?" question so an ordinary scored
  // entry is never described as an unreversible one.
  if (hasRunStarted(destination)) {
    return { kind: 'blocked', reason: 'run-started' };
  }

  // A legacy pair has no FK, and the server reverse follows the FK — so it can
  // be RECOGNISED here but never reversed. Report it as source-missing rather
  // than offering a control the server will refuse.
  if (!linkedSourceId) {
    return { kind: 'blocked', reason: 'source-missing' };
  }

  const source = await replicatedEntriesTable.getEntryById(linkedSourceId);
  if (!source || readEntryStatusOf(source) !== 'moved' || source.deletedAt || source.deleted_at) {
    return { kind: 'blocked', reason: 'source-missing' };
  }

  const sourceClassId = source.classId ?? source.class_id ?? null;
  const sourceClass = sourceClassId
    ? await replicatedClassesTable.getClassById(sourceClassId)
    : null;

  return {
    kind: 'available',
    destinationEntryId,
    sourceEntryId: source.id,
    sourceClassId,
    sourceClassName: sourceClass?.name ?? null,
  };
}

/**
 * Put the dog back in the class they were moved out of (MYK9-640).
 *
 * ONE server call, the mirror of the move-up: it restores the source from the
 * destination's OWN live entry status and check-in — the row that has been live
 * since the move, which may have been checked in hours later — and soft-deletes
 * the destination, in a single transaction.
 *
 * It touches no money, because after MYK9-639 the destination never held any:
 * the settlement stayed on the entry the exhibitor paid for, which is the very
 * row being restored. The earlier shape, where the destination carried a copy of
 * the payment, could not be reversed without losing whatever had been recorded
 * on it since.
 *
 * The client guard above is for the dialog's explanation; the refusals that
 * matter (authorization, movability, a started run, a missing source) are the
 * RPC's, so a stale tab cannot talk its way past them.
 */
export async function reverseShowMapMoveUp(destinationEntryId: string): Promise<MoveUpReversal> {
  const state = await resolveMoveUpReversal(destinationEntryId);
  if (state.kind !== 'available') {
    throw createDatabaseError(
      new Error(MOVE_UP_REVERSAL_REFUSALS[state.reason]),
      'entries',
      'show_map_reverse_move_up'
    );
  }

  await replicatedEntriesTable.reverseMoveUpEntryViaRpc(destinationEntryId);

  return {
    destinationEntryId: state.destinationEntryId,
    sourceEntryId: state.sourceEntryId,
    sourceClassId: state.sourceClassId,
    sourceClassName: state.sourceClassName,
  };
}

export const MOVE_UP_REVERSAL_REFUSALS: Record<MoveUpReversalBlockedReason, string> = {
  'not-a-move-up': 'This entry was not created by a move-up, so there is nothing to move back.',
  'source-missing':
    'The class this entry was moved out of no longer has the original entry, so it cannot be restored.',
  'run-started': 'This run has already started, so the move-up can no longer be reversed.',
};

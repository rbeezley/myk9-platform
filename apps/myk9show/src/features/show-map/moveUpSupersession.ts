import type { CheckInStatus } from '@myk9/core';

import { createDatabaseError } from '@/services/database/supabaseClient';
import { isMovedUpToNote, parseMovedUpFromClassId } from '@/services/database/entries/moveUpNote';
import { replicatedClassesTable, replicatedEntriesTable } from '@/services/replication';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';
import { logReplicatedEntryStatusChange } from '@/services/show-day/entryStatusAudit';

type SourceEntry = NonNullable<Awaited<ReturnType<typeof replicatedEntriesTable.getEntryById>>>;

/**
 * Everything about the SOURCE entry's settlement that must travel to the
 * destination of a move-up (MYK9-639).
 *
 * A move-up is a supersession: one dog, one paid run, recorded in a different
 * class. The destination therefore carries the source's payment state, fee,
 * method and bookkeeping, its comp decision, its discount, its day-of-show
 * flag, and its registration/enrollment link -- so the Financial Report can
 * skip the superseded source (`entry_status = 'moved'`) and still show the
 * entry, the fee and the payment method a secretary recognises.
 *
 * Fields are spread only when the source actually carries them, so a partially
 * hydrated replica row never writes `null` over a column it simply did not
 * read. `is_day_of_show` is copied, not re-derived -- MYK9-642 owns how that
 * flag is set on genuinely NEW entries, and a move-up creates no new entry in
 * the show's eyes.
 *
 * Refund columns are deliberately NOT carried: a refunded entry is settled
 * somewhere else, and refunds are MYK9-638's separate concern.
 */
/**
 * Pick whichever casing the replica row actually carries, by PRESENCE.
 *
 * `a ?? b` cannot do this job: a deliberate `null` (`comped_reason` cleared, a
 * `discount_amount` of nothing) collapses to the fallback and then to
 * `undefined`, and the field is dropped from the carry entirely instead of
 * travelling as the null it is.
 */
function pick<T>(camel: T | undefined, snake: T | undefined): T | undefined {
  return camel !== undefined ? camel : snake;
}

export function movedUpPaymentCarry(source: SourceEntry): Partial<ReplicatedEntry> {
  const compedReason = pick(source.compedReason, source.comped_reason);
  const discountAmount = pick(source.discountAmount, source.discount_amount);

  return {
    ...(source.paymentStatus !== undefined ? { paymentStatus: source.paymentStatus } : {}),
    ...(source.entryFee !== undefined ? { entryFee: source.entryFee } : {}),
    ...(source.paymentMethod !== undefined ? { paymentMethod: source.paymentMethod } : {}),
    ...(source.paymentReference !== undefined ? { paymentReference: source.paymentReference } : {}),
    ...(source.paymentReceivedOn !== undefined
      ? { paymentReceivedOn: source.paymentReceivedOn }
      : {}),
    ...(source.paymentNotes !== undefined ? { paymentNotes: source.paymentNotes } : {}),
    ...(source.comped !== undefined ? { comped: source.comped } : {}),
    ...(compedReason !== undefined ? { compedReason, comped_reason: compedReason } : {}),
    ...(discountAmount !== undefined ? { discountAmount, discount_amount: discountAmount } : {}),
    ...(source.isDayOfShow !== undefined ? { isDayOfShow: source.isDayOfShow } : {}),
    ...(source.registrationId !== undefined ? { registrationId: source.registrationId } : {}),
    ...(source.entrySource !== undefined ? { entrySource: source.entrySource } : {}),
  };
}

/**
 * Why a move-up cannot be reversed right now, in the words the dialog shows.
 *
 * `not-a-move-up` is not an error — it is the ordinary answer for every entry
 * that was never moved, and the control simply is not offered.
 */
export type MoveUpReversalBlockedReason = 'not-a-move-up' | 'source-missing' | 'destination-scored';

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

/**
 * True once a judge has recorded anything against this entry. A move cannot be
 * taken back after that: the result belongs to the class it was earned in, and
 * un-creating the entry would take the score with it.
 *
 * `result_status` defaults to `'pending'`, so it is compared rather than merely
 * tested for presence — otherwise every untouched entry would read as scored.
 */
function hasRecordedResult(entry: Partial<ReplicatedEntry>): boolean {
  const resultStatus = entry.resultStatus ?? entry.result_status;
  return (
    entry.isScored === true ||
    entry.is_scored === true ||
    (typeof resultStatus === 'string' && resultStatus !== 'pending') ||
    entry.finalPlacement != null ||
    entry.final_placement != null
  );
}

/**
 * Find the entry a move-up superseded, so the secretary can be offered the way
 * back (MYK9-640).
 *
 * TWO links, in order:
 *
 *  1. `moved_from_entry_id` on the destination — the durable one, written by
 *     `moveUpShowMapEntry` and added by migration 20260918193300.
 *  2. the `"Moved up from class <id>"` note the same write has always left in
 *     `special_requests` (see services/database/entries/moveUpNote.ts), matched
 *     back to the one `moved` entry for this dog in that class.
 *
 * The second is not redundancy for its own sake: it is what makes every move-up
 * recorded BEFORE the migration reversible, and what keeps the control working
 * on a device whose replica predates the column. Both reads go through the
 * replicated tables, so this answers offline.
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
  if (hasRecordedResult(destination)) {
    return { kind: 'blocked', reason: 'destination-scored' };
  }

  const source = linkedSourceId
    ? await replicatedEntriesTable.getEntryById(linkedSourceId)
    : await findMovedSourceInClass(notedSourceClassId!, destination.dogId);

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

async function findMovedSourceInClass(classId: string, dogId: string | undefined) {
  if (!dogId) return null;
  const candidates = await replicatedEntriesTable.getEntriesByClass(classId);
  return (
    candidates.find(
      candidate =>
        candidate.dogId === dogId &&
        readEntryStatusOf(candidate) === 'moved' &&
        !candidate.deletedAt &&
        !candidate.deleted_at
    ) ?? null
  );
}

/**
 * Put the dog back in the class they were moved out of (MYK9-640).
 *
 * The destination is soft-deleted and the source is restored to the
 * destination's OWN live state — its entry status and its check-in — not to a
 * status captured at move time. That is the whole point of a durable reverse:
 * it is offered hours later, after the dog has been checked in, and the current
 * truth is on the row that is live now.
 *
 * Soft-delete first, then restore, matching `undoShowMapMoveUp`: if the second
 * write fails the dog is briefly stranded rather than entered twice, and a
 * duplicate live entry in two classes is the worse show-day failure.
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

  const destination = await replicatedEntriesTable.getEntryById(destinationEntryId);
  const restoredEntryStatus = liveEntryStatus(readEntryStatusOf(destination));
  const restoredCheckInStatus = (destination?.checkInStatus ??
    destination?.check_in_status ??
    'no-status') as CheckInStatus;

  const deletedAt = new Date().toISOString();
  await replicatedEntriesTable.updateEntry(destinationEntryId, {
    deletedAt,
    deleted_at: deletedAt,
  });

  const source = await replicatedEntriesTable.getEntryById(state.sourceEntryId);
  const restoredSpecialRequests = clearMovedUpToNote(
    source?.specialRequests ?? source?.special_requests ?? null
  );

  await replicatedEntriesTable.updateEntry(state.sourceEntryId, {
    entryStatus: restoredEntryStatus,
    entry_status: restoredEntryStatus,
    checkInStatus: restoredCheckInStatus,
    check_in_status: restoredCheckInStatus,
    specialRequests: restoredSpecialRequests,
    special_requests: restoredSpecialRequests,
  });

  await logReplicatedEntryStatusChange({
    entryId: state.sourceEntryId,
    fromStatus: 'moved',
    toStatus: restoredEntryStatus,
    action: 'restore_entry_status',
    metadata: {
      checkInStatus: restoredCheckInStatus,
      reversedMoveUpFromEntryId: destinationEntryId,
    },
  });

  return {
    destinationEntryId: state.destinationEntryId,
    sourceEntryId: state.sourceEntryId,
    sourceClassId: state.sourceClassId,
    sourceClassName: state.sourceClassName,
  };
}

const MOVE_UP_REVERSAL_REFUSALS: Record<MoveUpReversalBlockedReason, string> = {
  'not-a-move-up': 'This entry was not created by a move-up, so there is nothing to move back.',
  'source-missing':
    'The class this entry was moved out of no longer has the original entry, so it cannot be restored.',
  'destination-scored':
    'This entry already has a result recorded, so the move-up can no longer be reversed.',
};

/**
 * The status to hand back to the restored source. The destination's own status
 * is used as-is, because it is the live one; the fallbacks exist only for a row
 * that somehow reads as `moved` or carries no status at all, where `confirmed`
 * is the state a move-up destination is created in.
 */
function liveEntryStatus(status: string | null): string {
  return status && status !== 'moved' ? status : 'confirmed';
}

/**
 * Drop the `"Moved up to <class>"` note the move-up wrote onto the source, and
 * ONLY that note. Anything a human typed there is left exactly as it is.
 */
function clearMovedUpToNote(note: string | null): string | null {
  return isMovedUpToNote(note) ? null : note;
}

/**
 * The ONE target rule for the "Change class" action (MYK9-1265), shared by the
 * Overview, the Show Desk and the write path so none can drift.
 *
 * Owner decision 2026-10-20: a class change may go to ANY class in ANY trial of
 * the show that is not complete (or cancelled) and that the dog is not already
 * entered in. Same trial, same element and a higher level are no longer
 * required. This replaces the move-up ladder (`moveUpEligibility.ts`) for this
 * action only; the exhibitor move-up REQUEST workflow keeps the ladder.
 *
 * Capacity is ADVISORY, as in `moveUpTargetSelection.ts`: a full class stays
 * listed, flagged `isFull`, and the write path and the server refuse it either way.
 */
import { classifyClassStatus } from '@/features/show-map/showMapStatus';

export interface ChangeClassCandidate {
  id: string;
  status?: string | null | undefined;
}

export interface SelectedChangeClassTarget<T> {
  cls: T;
  /** Known to have no free seat. Never true when capacity is unknown. */
  isFull: boolean;
}

/** A class that has finished running or was cancelled cannot take an entry. */
export function isClassClosedToChange(status: string | null | undefined): boolean {
  const kind = classifyClassStatus(status ?? undefined)?.kind;
  return kind === 'complete' || kind === 'muted';
}

/**
 * Whether an entry row still occupies its dog's slot in a class. Mirrors the
 * server's `entries_dog_class_unique_idx` predicate (not deleted, not withdrawn
 * or scratched), which is what `move_up_entry` refuses on. A `moved` row still
 * counts: moving back into it is the dialog's "Move back", not a new move.
 */
export function entryHoldsDogInClass(entry: {
  entryStatus?: string | null | undefined;
  entry_status?: string | null | undefined;
  deletedAt?: string | null | undefined;
  deleted_at?: string | null | undefined;
}): boolean {
  if (entry.deletedAt ?? entry.deleted_at) return false;
  const status = entry.entryStatus ?? entry.entry_status;
  return status !== 'withdrawn' && status !== 'scratched';
}

export function selectChangeClassTargets<T extends ChangeClassCandidate>(
  classes: readonly T[],
  currentClassId: string | null | undefined,
  enteredClassIds: ReadonlySet<string>,
  availableSpots: (cls: T) => number | null | undefined
): SelectedChangeClassTarget<T>[] {
  if (!currentClassId) return [];
  return classes
    .filter(
      cls =>
        cls.id !== currentClassId &&
        !enteredClassIds.has(cls.id) &&
        !isClassClosedToChange(cls.status)
    )
    .map(cls => {
      const spots = availableSpots(cls);
      return { cls, isFull: typeof spots === 'number' && spots <= 0 };
    });
}

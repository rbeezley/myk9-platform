/**
 * When a My Shows class row offers "Change class…" (MYK9-1978), and which
 * classes the sheet lists.
 *
 * The server (`request_own_entry_class_change`) is the judge of every refusal;
 * this is only the list of things the client already knows, so the exhibitor is
 * not offered a class the request would bounce off.
 *
 * @module MyEntriesPage/modules/changeClassRow
 */

import type { ClassAvailability } from '@/hooks/useClassAvailability';
import { getClassEntryWindow } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.availability';
import { EntryStatus } from '@/types/show-registration-types';
import type { ClassRowKind } from './myShowDogState';
import type { MyShowClass } from './groupEntriesByShow';

/** Row kinds that are still ahead of the ring: nothing has started for this dog. */
const BEFORE_THE_RING: ReadonlySet<ClassRowKind> = new Set<ClassRowKind>([
  'check-in-available',
  'opens-later',
  'not-yet-eligible',
  'closed-today',
]);

export interface ChangeClassRowContext {
  kind: ClassRowKind;
  isPastShow: boolean;
  isShowClosedOut: boolean;
  unresolved: boolean;
  hasShowId: boolean;
  entryStatus: MyShowClass['entryStatus'];
}

/**
 * Only an accepted entry that has not been to the ring may ask. A waiting
 * request has its own row text and "Take back request" instead.
 */
export function canChangeClass(context: ChangeClassRowContext): boolean {
  return (
    !context.isPastShow &&
    !context.isShowClosedOut &&
    !context.unresolved &&
    context.hasShowId &&
    context.entryStatus === EntryStatus.ACCEPTED &&
    BEFORE_THE_RING.has(context.kind)
  );
}

export type ChangeClassOptionState = 'open' | 'full';

export interface ChangeClassOption {
  classId: string;
  /** "Container Advanced" */
  name: string;
  /** "Trial 2" or the trial date, so two trials' classes are told apart. */
  trialLabel: string;
  state: ChangeClassOptionState;
}

/**
 * The classes this entry could ask for: every other class of the show that the
 * dog is not already in and that has not started, finished or been cancelled. A
 * full class stays in the list, marked, and cannot be picked.
 */
export function listChangeClassOptions(input: {
  classes: readonly ClassAvailability[];
  currentClassId: string | undefined;
  /** Every class this dog is already entered in at this show. */
  dogClassIds: ReadonlySet<string>;
}): ChangeClassOption[] {
  return input.classes
    .filter(cls => {
      if (cls.classId === input.currentClassId || input.dogClassIds.has(cls.classId)) return false;
      return getClassEntryWindow({
        status: cls.status,
        hasStarted: cls.hasStarted,
        isStaff: false,
      }).enterable;
    })
    .map(cls => ({
      classId: cls.classId,
      name: cls.className,
      trialLabel: cls.trialName,
      state: cls.isFull ? ('full' as const) : ('open' as const),
    }))
    .sort((a, b) => a.trialLabel.localeCompare(b.trialLabel) || a.name.localeCompare(b.name));
}

/**
 * The secretary's decline writes `Move-up denied: <reason>` (or the bare
 * `Move-up request denied`) into the entry's special requests and puts the entry
 * back to accepted (`denyMoveUpRequestReplicated`). That note is the stored fact
 * the exhibitor's row reads for its "declined" state. Returns the reason ('' when
 * none was given), or null when the row was not declined.
 */
export function declinedClassChangeReason(
  entryStatus: MyShowClass['entryStatus'],
  specialRequests: string | null | undefined
): string | null {
  if (entryStatus !== EntryStatus.ACCEPTED || !specialRequests) return null;
  if (specialRequests === 'Move-up request denied') return '';
  const prefix = 'Move-up denied: ';
  return specialRequests.startsWith(prefix) ? specialRequests.slice(prefix.length) : null;
}

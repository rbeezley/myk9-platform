/**
 * Pure derivations for the dog card's rolled-up chip and each class row's state
 * (D4). Nothing here fetches, renders, or writes — the component picks colours
 * and copy from the `kind` it gets back.
 *
 * The two derivations answer different questions on purpose: the chip says what
 * is true of the DOG (entry status, or the strongest day-of signal across its
 * classes), while the row says what is true of ONE class (its result, its
 * check-in state, or the control it can offer right now).
 *
 * @module MyEntriesPage/modules/myShowDogState
 */

import { isAccountedFor, isExpectedEntry } from '@/features/_shared/entryAccounting';
import { EntryStatus } from '@/types/show-registration-types';
import { getEntryStatusStateLabel } from '@/components/entries/management/reviewStateLabels';
import {
  isClassCheckInAvailableToday,
  isClassCheckInEligibleAnyDay,
  isTrialDayAhead,
  isTrialDayToday,
  type DayCheckInContext,
} from './dayCheckIn';
import type { MyShowClass, MyShowDog } from './groupEntriesByShow';
import { getEntryStatusBadgeLabel, getStatusBadgeValue } from './myEntriesUtils';
import { getPartiallyScoredState, isSettledWithoutScore } from './myEntriesStats.helpers';

/* ------------------------------------------------------------------ rows -- */

export type ClassRowKind =
  | 'result'
  | 'in-ring'
  | 'at-gate'
  | 'come-to-gate'
  | 'conflict'
  | 'pulled'
  | 'withdrawn'
  | 'checked-in'
  | 'check-in-available'
  | 'opens-later'
  | 'not-yet-eligible'
  | 'closed-today'
  | 'not-run'
  | 'absent';

export interface ClassRowState {
  kind: ClassRowKind;
}

/**
 * A row that is settled without ever being scored — absent, excused, withdrawn.
 * `isAccountedFor` calls these done; `isScored` stays false, so they must not
 * render as a result.
 */
function isAbsentClass(cls: MyShowClass): boolean {
  return isAccountedFor(cls) && cls.isScored !== true;
}

/**
 * A class the exhibitor (or the secretary) took out of the show.
 *
 * Exactly the predicate the Edit Entry dialog already uses to render its
 * `Pulled` badge: `mapClassEntryStatus` folds both `withdrawn` and `scratched`
 * entry statuses onto the row's `'scratched'` participation value, and the
 * canonical `entryStatus` is checked too because a row can arrive with only
 * the lossy UI enum populated. This is a LIFECYCLE fact, distinct from the
 * day-of `check_in_status = 'pulled'` the rows above read.
 */
function isWithdrawnClass(cls: MyShowClass): boolean {
  return (
    cls.status === 'scratched' ||
    cls.entryStatus === EntryStatus.CANCELLED ||
    cls.entryStatus === EntryStatus.SCRATCHED
  );
}

/**
 * Derive one class row's state.
 *
 * Precedence: a recorded outcome (result, then a settled absence, then a
 * withdrawal) outranks any check-in state, which outranks the controls. With no state and no outcome the
 * row either offers check-in (today, eligible, toggle open), announces the day
 * it opens, or — once its day has passed — reports that it never ran.
 */
export function deriveClassRowState(cls: MyShowClass, ctx: DayCheckInContext): ClassRowState {
  if (cls.isScored === true) return { kind: 'result' };
  if (isAbsentClass(cls)) return { kind: 'absent' };
  // A withdrawn class is settled before any check-in state can speak for it,
  // and before the day math below — which otherwise offered it "check in with
  // the secretary" on the trial day and nothing at all before it (MYK9-582).
  if (isWithdrawnClass(cls)) return { kind: 'withdrawn' };

  // The check-in column is read FIRST and in full. `entryStatusKind` is only a
  // fallback for a row that has no check-in column of its own, because
  // `getEntryStatusKindForDisplay` collapses checked-in, at-gate AND in-ring
  // into the single `in_ring` kind — testing it first made every checked-in or
  // at-gate class render "in the ring" and lose its "change" link, since the
  // production mapper always populates the kind alongside the column.
  if (cls.checkInStatus === 'in-ring') return { kind: 'in-ring' };
  if (cls.checkInStatus === 'pulled') return { kind: 'pulled' };
  if (cls.checkInStatus === 'conflict') return { kind: 'conflict' };
  if (cls.checkInStatus === 'at-gate') return { kind: 'at-gate' };
  if (cls.checkInStatus === 'come-to-gate') return { kind: 'come-to-gate' };
  if (cls.checkInStatus === 'checked-in') return { kind: 'checked-in' };
  if (cls.entryStatusKind === 'in_ring') return { kind: 'in-ring' };

  if (isClassCheckInAvailableToday(cls, ctx)) return { kind: 'check-in-available' };

  // With no state and no outcome the row is either still ahead of the
  // exhibitor, closed to them today, or was never run. Today-but-no-control
  // (self-check-in closed by the secretary, entry not accepted yet, class
  // relation unresolved) gets its own kind: "opens Saturday" ON Saturday reads
  // as a broken clock, and "not run" would be a lie — the run is still ahead.
  const dayAhead = isTrialDayAhead(cls.trialDate, cls.trialTimezone, ctx.now);
  const dayToday = isTrialDayToday(cls.trialDate, cls.trialTimezone, ctx.now);
  const dayPast = cls.trialDate ? !dayAhead && !dayToday : false;
  if (!ctx.isPastShow && dayToday) return { kind: 'closed-today' };
  if (!ctx.isPastShow && !dayPast) {
    // A day still ahead may promise check-in ONLY when the same eligibility
    // the day-of predicate applies would pass (entry accepted, class entered,
    // not unresolved, self check-in enabled) — otherwise a pending, disabled,
    // or unresolved row would claim check-in "opens" on a day it never will
    // (MYK9-568 round 3). The ineligible case renders nothing in that slot;
    // the dog-level status and the row's own date already tell the truth.
    return isClassCheckInEligibleAnyDay(cls, ctx)
      ? { kind: 'opens-later' }
      : { kind: 'not-yet-eligible' };
  }

  return { kind: 'not-run' };
}

/* ------------------------------------------------------------------ chip -- */

export type DogChipKind =
  | 'cancelled'
  | 'pulled'
  | 'conflict'
  | 'in_ring'
  | 'at_gate'
  | 'checked_in'
  | 'partially_scored'
  | 'scored'
  | 'absent'
  | 'status';

export interface DogChipState {
  kind: DogChipKind;
  /** Exhibitor-facing text for the chip. */
  label: string;
  /**
   * Key into `ENTRY_STATUS_DESCRIPTORS` — the chip's icon and colour.
   *
   * Returned here rather than mapped in the component so there is ONE table:
   * a component-side map has to guess what `kind: 'status'` means and had
   * every accepted, waitlisted and rejected dog wearing pending's warning
   * colour under its own correct label.
   */
  status: string;
}

export interface DogChipContext {
  isPastShow: boolean;
  isShowCancelled: boolean;
}

/** Classes that could still carry a check-in state — not settled, not excluded. */
function checkInBearingClasses(dog: MyShowDog): MyShowClass[] {
  return dog.classes.filter(cls => isExpectedEntry(cls) && !isAccountedFor(cls));
}

/**
 * Roll a dog's classes up into one chip.
 *
 * Precedence (exhibitor-my-shows-legibility): cancelled show, then the
 * strongest day-of signal across the classes, then scoring progress, then the
 * dog's own entry status. Day-of beats scoring on purpose — a dog in the ring
 * right now is what the exhibitor needs to see, not that one earlier class
 * already has a result.
 */
export function deriveDogChip(dog: MyShowDog, ctx: DogChipContext): DogChipState {
  if (ctx.isShowCancelled) return { kind: 'cancelled', label: 'Cancelled', status: 'not_accepted' };

  const classes = dog.classes;
  if (classes.some(cls => cls.checkInStatus === 'pulled')) {
    return { kind: 'pulled', label: 'Pulled', status: 'pulled' };
  }
  if (classes.some(cls => cls.checkInStatus === 'conflict')) {
    return { kind: 'conflict', label: 'Conflict', status: 'conflict' };
  }
  if (classes.some(cls => cls.checkInStatus === 'in-ring')) {
    return { kind: 'in_ring', label: 'In ring', status: 'in_ring' };
  }
  if (classes.some(cls => cls.checkInStatus === 'at-gate')) {
    return { kind: 'at_gate', label: 'At gate', status: 'at_gate' };
  }
  // Same fallback ordering as the row: the collapsed `in_ring` kind only
  // speaks for a class whose own check-in column said nothing.
  if (classes.some(cls => cls.entryStatusKind === 'in_ring' && !cls.checkInStatus)) {
    return { kind: 'in_ring', label: 'In ring', status: 'in_ring' };
  }

  const bearing = checkInBearingClasses(dog);
  if (bearing.length > 0 && bearing.every(cls => cls.checkInStatus === 'checked-in')) {
    return { kind: 'checked_in', label: 'Checked in', status: 'checked_in' };
  }

  if (getPartiallyScoredState(dog)) {
    return { kind: 'partially_scored', label: 'Partially scored', status: 'in-progress' };
  }

  // Settled without a score (every run absent/excused) is NOT "Scored" — there
  // is no result to show — so it gets its own chip before the scored check.
  if (isSettledWithoutScore(dog)) return { kind: 'absent', label: 'Absent', status: 'absent' };

  // Every run settled AND at least one genuinely scored. Requiring `isScored`
  // on every row would drop a dog whose day finished with one result and one
  // excused run back to its entry status, which reads as "Accepted" long after
  // the dog is done.
  const expected = classes.filter(isExpectedEntry);
  if (expected.length > 0 && expected.every(isAccountedFor) && expected.some(cls => cls.isScored)) {
    return { kind: 'scored', label: 'Scored', status: 'completed' };
  }

  return {
    kind: 'status',
    label: entryStatusLabel(dog, ctx),
    status: getStatusBadgeValue(dog.entryStatus ?? EntryStatus.PENDING, dog.entryStatusKind),
  };
}

/**
 * The dog's entry-status label, through the same badge vocabulary the rest of
 * My Shows uses. `getEntryStatusBadgeLabel` returns undefined for the statuses
 * whose badge derives its own text (ACCEPTED chief among them), so fall back to
 * the canonical exhibitor label rather than rendering an empty chip.
 */
function entryStatusLabel(dog: MyShowDog, ctx: DogChipContext): string {
  const badgeLabel = getEntryStatusBadgeLabel(dog.entryStatus, {
    statusKind: dog.entryStatusKind,
    isPastShow: ctx.isPastShow,
    isShowCancelled: ctx.isShowCancelled,
  });
  return (
    badgeLabel ?? getEntryStatusStateLabel(dog.entryStatus ?? EntryStatus.PENDING, 'exhibitor')
  );
}

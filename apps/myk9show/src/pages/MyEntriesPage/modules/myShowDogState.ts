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

import { isAccountedFor } from '@/features/_shared/entryAccounting';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryStatusKind } from '@/services/entryDisplay/entryDisplaySelectors';
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
  | 'scratched'
  | 'moved'
  | 'not-accepted'
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
 * Settled lifecycle kinds, and the row kind each one renders as.
 *
 * Keyed on `entryStatusKind` — the LOSSLESS classification `entryDisplay`
 * emits — and never on `entryStatus`, the UI enum beside it. That enum has no
 * `absent` member, so `mapEntryStatusKindToUi` folds a terminal
 * `entry_status='absent'` row onto `PENDING`: a predicate reading it cannot
 * see the row at all, and the row then fell through to the day math and
 * offered "check in with the secretary" on the trial day — the very complaint
 * MYK9-582 was filed against, surviving inside the branch meant to fix it.
 *
 * `moved` and `not_accepted` keep their own kinds rather than reading as a
 * withdrawal: a move-up's source row went somewhere, and a decline is the
 * secretary's, not the exhibitor's.
 *
 * The keys are exactly the lifecycle states `isExpectedEntry` excludes —
 * `entryAccounting.EXCLUDED_ENTRY_STATUSES`, all five of them.
 * `myShowDogState.lifecycle.test.ts` drives every member of that exported set
 * through the real mappers and asserts each lands on a settled row kind.
 */
const SETTLED_ROW_KINDS: Readonly<Partial<Record<EntryStatusKind, ClassRowKind>>> = {
  withdrawn: 'withdrawn',
  scratched: 'scratched',
  absent: 'absent',
  moved: 'moved',
  not_accepted: 'not-accepted',
};

/**
 * The row kind for a class the show will never put in the ring, or `undefined`
 * when the row is still live.
 *
 * Two rows survive a settled KIND and stay live:
 *
 *  - `promotion-expired`. It classifies as `not_accepted`, but the owner
 *    decided (2026-06-18, `entryStatusUiAdapter.mapEntryStatus`) that it stays
 *    in the review lane rather than reading as a decline. `EntryClass` does not
 *    carry the raw `entry_status`, so the ONLY record of that override on this
 *    row is the disagreement it creates: kind `not_accepted` beside
 *    `EntryStatus.PENDING`. The guard is scoped to that ONE kind on purpose —
 *    a terminal `absent` row also projects onto PENDING, because the enum has
 *    no `absent` member, and a blanket check swallowed it. `paid`, the other
 *    override, classifies as `accepted` and is not settled at all.
 *  - A row with no `entryStatusKind`. The field is optional on `EntryClass`,
 *    and while `useMyEntriesData` — this page's only producer, including its
 *    optimistic check-in path, which spreads the existing row — always
 *    populates it, an unclassified row must read as live rather than be
 *    silently settled.
 *
 * Deliberately blind to `check_in_status = 'pulled'`, which `isExpectedEntry`
 * also excludes. That is a DAY-OF state with its own row kind and its own
 * "change" link, and folding it in here would take both away.
 */
function settledRowKind(cls: MyShowClass): ClassRowKind | undefined {
  const settled = cls.entryStatusKind ? SETTLED_ROW_KINDS[cls.entryStatusKind] : undefined;
  if (!settled) return undefined;
  if (settled === 'not-accepted' && cls.entryStatus === EntryStatus.PENDING) return undefined;
  return settled;
}

/**
 * A class still live by LIFECYCLE — the filter the dog chip's day-of scans run
 * over. See `settledRowKind` for why `check_in_status` is not consulted.
 */
function isLiveByLifecycle(cls: MyShowClass): boolean {
  return settledRowKind(cls) === undefined;
}

/**
 * Derive one class row's state.
 *
 * Precedence: a recorded outcome (a result, then a settled absence, then a
 * settled lifecycle) outranks any check-in state, which outranks the controls.
 * With no state and no outcome the row either offers check-in (today, eligible,
 * toggle open), announces the day it opens, or — once its day has passed —
 * reports that it never ran.
 */
export function deriveClassRowState(cls: MyShowClass, ctx: DayCheckInContext): ClassRowState {
  if (cls.isScored === true) return { kind: 'result' };
  // A RECORDED absence outranks the lifecycle on purpose: a row withdrawn on
  // paper but marked absent/excused in the ring has an outcome the exhibitor
  // should see, and `ResultBadge` names it exactly. The lifecycle branch below
  // only speaks for rows with no outcome at all.
  if (isAbsentClass(cls)) return { kind: 'absent' };
  // Settled by lifecycle — before any check-in state can speak for it, and
  // before the day math, which otherwise offered such a row "check in with the
  // secretary" on the trial day and nothing at all before it (MYK9-582). A
  // settled row must never reach the day math, with no exceptions: the
  // cancelled-show carve-out tried in round 2 put every row of a cancelled
  // show, withdrawn ones included, straight back into that copy.
  const settled = settledRowKind(cls);
  if (settled) return { kind: settled };

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

/**
 * Classes that could still carry a check-in state — not settled, not excluded.
 *
 * Lifecycle exclusion runs through `isLiveByLifecycle`, the SAME predicate the
 * rows use, not `isExpectedEntry`. The shared helper reads the lossy
 * `entryStatus` enum, which has no `absent` member, so an absent class counted
 * as live here and held the chip on "Accepted" over a dog already checked in
 * (MYK9-582 review round 3).
 */
function checkInBearingClasses(dog: MyShowDog): MyShowClass[] {
  return liveClasses(dog.classes).filter(cls => !isAccountedFor(cls));
}

/** The lifecycle filter, in one place for every caller in this module. */
function liveClasses(classes: MyShowClass[]): MyShowClass[] {
  return classes.filter(isLiveByLifecycle);
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

  // Day-of signals, scoring progress and the entry-status fallback may only
  // come from classes the show still expects to run. A withdrawn row keeps
  // whatever `check_in_status` it had when it was pulled from the running
  // order, and letting that stale value speak made a mixed card read "Pulled"
  // at the dog level while its live class was still pending (MYK9-582 round 1).
  const live = liveClasses(dog.classes);
  if (live.some(cls => cls.checkInStatus === 'pulled')) {
    return { kind: 'pulled', label: 'Pulled', status: 'pulled' };
  }
  if (live.some(cls => cls.checkInStatus === 'conflict')) {
    return { kind: 'conflict', label: 'Conflict', status: 'conflict' };
  }
  if (live.some(cls => cls.checkInStatus === 'in-ring')) {
    return { kind: 'in_ring', label: 'In ring', status: 'in_ring' };
  }
  if (live.some(cls => cls.checkInStatus === 'at-gate')) {
    return { kind: 'at_gate', label: 'At gate', status: 'at_gate' };
  }
  // Same fallback ordering as the row: the collapsed `in_ring` kind only
  // speaks for a class whose own check-in column said nothing.
  if (live.some(cls => cls.entryStatusKind === 'in_ring' && !cls.checkInStatus)) {
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
  if (live.length > 0 && live.every(isAccountedFor) && live.some(cls => cls.isScored)) {
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

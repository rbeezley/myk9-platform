/**
 * THE lifecycle predicate for My Shows class rows (MYK9-624).
 *
 * The dog chip, the class rows and the stats helpers (Upcoming / Completed
 * tabs, "Partially scored", per-dog outstanding counts) all ask the same
 * question — "will the show put this class in the ring?" — and they used to
 * answer it in two places with two inputs. The stats helpers went through
 * `isExpectedEntry`, which on this page reads the LOSSY UI enum `entryStatus`;
 * that enum has no `absent` member (`mapEntryStatusKindToUi` folds it onto
 * PENDING), so a terminal absent class counted as expected and unscored and
 * the chip read "Partially scored" with nothing left to run.
 *
 * The lifecycle keys on the LOSSLESS `entryStatusKind` instead, and on nothing
 * else, so it matches the server's accounting. A recorded WD result, which no
 * predicate read before, is a ROW-level outcome (`isSettledByOutcome`): the row
 * shows its WD badge and offers no check-in, and the class stays expected.
 *
 * @module MyEntriesPage/modules/myShowLifecycle
 */

import { isAccountedFor } from '@/features/_shared/entryAccounting';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryStatusKind } from '@/services/entryDisplay/entryDisplaySelectors';
import type { EntryClass } from './my-entries-types';

/** The lifecycle kinds meaning the show will not put this class in the ring. */
export type SettledLifecycleKind = 'withdrawn' | 'scratched' | 'absent' | 'moved' | 'not_accepted';

/**
 * Exactly the lifecycle states `entryAccounting.EXCLUDED_ENTRY_STATUSES` names,
 * in kind vocabulary. `myShowDogState.lifecycle.test.ts` drives every member of
 * that set through the real mappers and asserts each one settles.
 */
const SETTLED_KINDS: ReadonlySet<EntryStatusKind> = new Set<SettledLifecycleKind>([
  'withdrawn',
  'scratched',
  'absent',
  'moved',
  'not_accepted',
]);

/** Fields the predicate reads — every `EntryClass` and `MyShowClass` satisfies it. */
export type LifecycleClass = Pick<
  EntryClass,
  'entryStatus' | 'entryStatusKind' | 'resultStatus' | 'checkInStatus' | 'deletedAt' | 'isScored'
>;

/**
 * The settled lifecycle of a class, or `undefined` while it is still live.
 *
 * Two rows survive a settled KIND and stay live:
 *
 *  - `promotion-expired`. It classifies as `not_accepted`, but the owner
 *    decided (2026-06-18, `entryStatusUiAdapter.mapEntryStatus`) that it stays
 *    in the review lane rather than reading as a decline. `EntryClass` does not
 *    carry the raw `entry_status`, so the ONLY record of that override on this
 *    row is the disagreement it creates: kind `not_accepted` beside
 *    `EntryStatus.PENDING`. The guard is scoped to that ONE kind on purpose —
 *    a terminal `absent` row also projects onto PENDING, and a blanket check
 *    swallowed it.
 *  - `paid`, the other override, classifies as `accepted` and is not settled.
 *
 * Entry status ONLY. A WD result (`result_status = 'withdrawn'`) is never a
 * lifecycle here: the server's accounting still expects that row and does not
 * count it accounted for, so it stays in the chip's and the stats' denominator.
 * It is a ROW-level outcome instead — see `isSettledByOutcome`.
 *
 * Deliberately blind to `check_in_status = 'pulled'`: that is a DAY-OF state
 * with its own row kind, chip and "change" link. `isExpectedClass` below is
 * where the day-of pull leaves the scoring denominator.
 */
export function settledLifecycleKind(cls: LifecycleClass): SettledLifecycleKind | undefined {
  const kind = cls.entryStatusKind;
  if (SETTLED_KINDS.has(kind)) {
    if (kind === 'not_accepted' && cls.entryStatus === EntryStatus.PENDING) return undefined;
    return kind as SettledLifecycleKind;
  }
  return undefined;
}

/** A class still live by lifecycle — may still carry a check-in state. */
export function isLiveByLifecycle(cls: LifecycleClass): boolean {
  return settledLifecycleKind(cls) === undefined;
}

/**
 * A class the show still expects to put in the ring, settled or not — the
 * scoring denominator. Live by lifecycle, not deleted, and not pulled day-of
 * (the server's `check_in_status IS DISTINCT FROM 'pulled'` clause).
 */
export function isExpectedClass(cls: LifecycleClass): boolean {
  if (cls.deletedAt != null) return false;
  return isLiveByLifecycle(cls) && cls.checkInStatus !== 'pulled';
}

/** Expected classes that still need a result. */
export function isOutstandingClass(cls: LifecycleClass): boolean {
  return isExpectedClass(cls) && !isAccountedFor(cls);
}

/**
 * Settled WITHOUT a score by a recorded outcome — an absent / excused result,
 * or a WD result. `isScored` stays false on all three, so none of them may
 * render as a result.
 */
export function isSettledByOutcome(cls: LifecycleClass): boolean {
  if (cls.isScored === true) return false;
  return isAccountedFor(cls) || cls.resultStatus === 'withdrawn';
}

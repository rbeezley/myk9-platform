/**
 * When a My Shows class row may offer "Leave class…" (MYK9-631 AC3, Q4).
 *
 * MYK9-631 makes leaving a class a ROW verb rather than a menu item: one
 * control on the class it acts on, opening `RemoveFromClassDialog` for that
 * class id, with no order picker in between. So the only question left is
 * *which rows* get one, and this is that answer — pure, so it can be driven
 * over every `ClassRowKind` rather than sampled through a render.
 *
 * The rule is the brief's: the class has not run, and the entry is not already
 * removed. It is expressed as a DENY list over `ClassRowKind` so a kind added
 * later has to be classified deliberately rather than silently inheriting
 * "offer it".
 *
 * Note what is NOT decided here. Whether THIS entry may actually be withdrawn
 * or pulled is the server's call, resolved by `useWithdrawEligibility` and
 * surfaced inside the dialog — a checked-in dog still sees the control, and
 * the dialog greys out the arm it cannot use with the reason. Hiding the
 * control for it would take away the pull the exhibitor is entitled to, which
 * is the same mistake `EntryEditClassRow` documents at its `canLeave`.
 *
 * @module MyEntriesPage/modules/leaveClassRow
 */

import type { ClassRowKind } from './myShowDogState';

/**
 * Row kinds that must never offer the control, and why.
 *
 *  - `result`, `absent`, `not-run` — the class already happened (or is on
 *    record as not having run). There is nothing left to leave.
 *  - `in-ring` — the dog is running it right now.
 *  - `withdrawn`, `scratched`, `moved`, `not-accepted` — the row is already
 *    settled off the running order. `pulled` is the day-of form of the same
 *    thing and keeps its own "change" link into the check-in dialog.
 */
const NOT_LEAVEABLE: ReadonlySet<ClassRowKind> = new Set<ClassRowKind>([
  'result',
  'absent',
  'not-run',
  'in-ring',
  'pulled',
  'withdrawn',
  'scratched',
  'moved',
  'not-accepted',
]);

/** True when this row may offer "Leave class…". */
export function canLeaveClassRow(kind: ClassRowKind): boolean {
  return !NOT_LEAVEABLE.has(kind);
}

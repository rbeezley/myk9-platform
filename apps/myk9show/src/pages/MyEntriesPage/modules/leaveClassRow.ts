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
 *    settled off the running order.
 *
 * `pulled` is deliberately NOT here, which round 1 corrected. It is a
 * `check_in_status`, not a lifecycle state: the entry is still entered, the
 * server admits it (`PRE_SHOW_CHECK_IN_STATUSES` lists exactly `no-status` and
 * `pulled`), and the base Edit sheet offered the control for it. Withholding it
 * meant a dog pulled at the gate could never be converted into a RECORDED
 * withdrawal — the refund-bearing arm — because the "change" link beside it
 * writes `check_in_status` alone and never touches `entry_status` or
 * `withdrawal_reason_code`.
 */
const NOT_LEAVEABLE: ReadonlySet<ClassRowKind> = new Set<ClassRowKind>([
  'result',
  'absent',
  'not-run',
  'in-ring',
  'withdrawn',
  'scratched',
  'moved',
  'not-accepted',
]);

/** True when this row's KIND may offer "Leave class…". */
export function canLeaveClassRow(kind: ClassRowKind): boolean {
  return !NOT_LEAVEABLE.has(kind);
}

/** Everything the row needs to decide, beyond its kind. */
export interface LeaveClassRowContext {
  kind: ClassRowKind;
  /** The show is over; nothing is left to leave. */
  isPastShow: boolean;
  /**
   * The partial-replication placeholder: the money is real but the class
   * identity is not, and the row renders "Unknown Class". `unresolved` is a
   * property of the ROW, not of its kind — an unresolved row derives as
   * `not-yet-eligible`, which a resolved row awaiting its day derives as too —
   * so no ordering of `ClassRowKind` can express this and it has to be its own
   * term. Writing a withdrawal against a class the app has just told itself it
   * cannot identify is exactly what `EntryClass.unresolved` exists to stop.
   */
  unresolved: boolean;
  /**
   * The show relation has not replicated. Every menu item already carries this
   * guard; the row control was missing it, and the consequence was worse than a
   * dead link: `useShowRegistryId('')` never resolves, so the chooser opened
   * with Withdraw disabled under "Checking the show's rules…" forever and Pull —
   * the arm with no refund path — as the only clickable option. The state where
   * the app knows least about the show must not be the state that steers the
   * exhibitor into forfeiting the rulebook.
   */
  hasShowId: boolean;
}

/** True when this row may offer "Leave class…". One place, all four terms. */
export function canLeaveClass(context: LeaveClassRowContext): boolean {
  return (
    !context.isPastShow &&
    !context.unresolved &&
    context.hasShowId &&
    canLeaveClassRow(context.kind)
  );
}

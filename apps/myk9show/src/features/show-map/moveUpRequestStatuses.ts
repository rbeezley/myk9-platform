/**
 * The entry statuses that mean "someone has ASKED for something about this
 * entry", and which therefore must not survive a move-up (MYK9-639 round 4).
 *
 * A request is a request about THIS entry, in THIS class, and `move_up_entry`
 * is what fulfils it. Carrying the status onto the destination put the
 * destination straight back into the pending queue: `MoveUpRequestsTab` approves
 * a request, re-reads `getPendingMoveUpRequests` (which filters on exactly
 * `'move-up-requested'`), and the same dog reappears — approvable again, one
 * rung higher each time.
 *
 * `'scratch-requested'` has the same shape from the other direction: an
 * exhibitor's request against the class they entered must not become a pending
 * request against a class they never did.
 *
 * Both spellings of each are live members of `entries_entry_status_check`.
 *
 * This list MIRRORS the CASE in `move_up_entry`
 * (20260918193300_myk9_639_move_up_supersession.sql). The contract test asserts
 * the SQL names exactly these, so the two cannot drift.
 */
export const MOVE_UP_REQUEST_STATUSES = [
  'move-up-requested',
  'move_up_requested',
  'scratch-requested',
  'scratch_requested',
] as const;

/** What a request status becomes on the destination: the request is fulfilled. */
export const MOVE_UP_REQUEST_FULFILLED_STATUS = 'confirmed';

/**
 * The status the destination of a move-up receives, given the source's.
 *
 * The approval state otherwise travels verbatim — a move-up is not an
 * acceptance, so a `submitted` or `pending-payment` source must not land
 * approved.
 */
export function destinationEntryStatusFor(sourceEntryStatus: string | null | undefined): string {
  const status = sourceEntryStatus?.trim() ?? '';
  return (MOVE_UP_REQUEST_STATUSES as readonly string[]).includes(status)
    ? MOVE_UP_REQUEST_FULFILLED_STATUS
    : status;
}

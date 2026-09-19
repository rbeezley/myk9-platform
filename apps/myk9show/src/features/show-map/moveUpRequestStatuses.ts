/**
 * The entry statuses that mean "someone has ASKED for something about this
 * entry", and which therefore must not survive a move-up.
 */
export const MOVE_UP_REQUEST_STATUSES = [
  'move-up-requested',
  'move_up_requested',
  'scratch-requested',
  'scratch_requested',
] as const;

export const MOVE_UP_REQUEST_FULFILLED_STATUS = 'confirmed';

/** What a request status becomes on the destination: the request is fulfilled. */
export function destinationEntryStatusFor<T extends string | null | undefined>(
  sourceEntryStatus: T
): string | T {
  const status = sourceEntryStatus?.trim();
  if (!status) return sourceEntryStatus;
  return (MOVE_UP_REQUEST_STATUSES as readonly string[]).includes(status)
    ? MOVE_UP_REQUEST_FULFILLED_STATUS
    : sourceEntryStatus;
}

/** SQL mirror: statuses fulfilled on the move-up destination. */
export const MOVE_UP_REQUEST_STATUSES = ['move-up-requested', 'move_up_requested'] as const;

export const MOVE_UP_REQUEST_FULFILLED_STATUS = 'confirmed';

/** Request statuses become confirmed; all other values pass through unchanged. */
export function destinationEntryStatusFor<T extends string | null | undefined>(
  sourceEntryStatus: T
): string | T {
  const status = sourceEntryStatus?.trim();
  if (!status) return sourceEntryStatus;
  return (MOVE_UP_REQUEST_STATUSES as readonly string[]).includes(status)
    ? MOVE_UP_REQUEST_FULFILLED_STATUS
    : sourceEntryStatus;
}

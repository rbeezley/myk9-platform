/**
 * The two stored statuses a show's close-out cares about, in the spellings the schedule carries.
 * One copy, so the close step and the calculation of what is left cannot read a status
 * differently (MYK9-1945).
 */
const COMPLETED_STATUSES = new Set(['completed', 'complete']);
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled']);

export function normalizeCloseoutStatus(status: string | null | undefined): string {
  return status?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';
}

export function isCompletedStatus(status: string | null | undefined): boolean {
  return COMPLETED_STATUSES.has(normalizeCloseoutStatus(status));
}

export function isCancelledStatus(status: string | null | undefined): boolean {
  return CANCELLED_STATUSES.has(normalizeCloseoutStatus(status));
}

/** Still open work: neither completed nor cancelled. */
export function needsCascade(status: string | null | undefined): boolean {
  return !isCompletedStatus(status) && !isCancelledStatus(status);
}

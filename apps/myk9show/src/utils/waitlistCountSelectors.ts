export interface WaitlistStatusLike {
  status?: string | null;
}

function normalizeWaitlistStatus(status: string | null | undefined): string {
  return (status ?? 'waiting').toLowerCase();
}

export function isQueuedWaitlistEntry(entry: WaitlistStatusLike): boolean {
  return normalizeWaitlistStatus(entry.status) === 'waiting';
}

export function isOfferedWaitlistEntry(entry: WaitlistStatusLike): boolean {
  return normalizeWaitlistStatus(entry.status) === 'offered';
}

export function filterQueuedWaitlistEntries<T extends WaitlistStatusLike>(
  entries: readonly T[]
): T[] {
  return entries.filter(isQueuedWaitlistEntry);
}

export function filterOfferedWaitlistEntries<T extends WaitlistStatusLike>(
  entries: readonly T[]
): T[] {
  return entries.filter(isOfferedWaitlistEntry);
}

export function countQueuedWaitlistEntries(entries: readonly WaitlistStatusLike[]): number {
  return entries.filter(isQueuedWaitlistEntry).length;
}

/**
 * The `entries.entry_status` values that hold a seat in a class: exactly the
 * set the server's capacity gate counts (`evaluate_entry_capacity` in
 * 20260712210000, `promote_waitlist_entry` in 20260622000222). The Waitlist tab
 * compares this count with `max_entries` to decide whether a promote can
 * succeed, so it must ask the question the server will ask (MYK9-718: it used
 * to count `'accepted'`, a status the CHECK constraint forbids, so it was 0).
 */
export const SEAT_HOLDING_ENTRY_STATUSES: ReadonlySet<string> = new Set([
  'submitted',
  'paid',
  'confirmed',
  'checked-in',
  'competing',
  'in-ring',
  'pending-payment',
]);

export function countSeatHoldingEntries(
  entries: readonly {
    entryStatus?: string | null | undefined;
    deletedAt?: string | null | undefined;
  }[]
): number {
  return entries.filter(
    entry => !entry.deletedAt && SEAT_HOLDING_ENTRY_STATUSES.has(entry.entryStatus ?? '')
  ).length;
}

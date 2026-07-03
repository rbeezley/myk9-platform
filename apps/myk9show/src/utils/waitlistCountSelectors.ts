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

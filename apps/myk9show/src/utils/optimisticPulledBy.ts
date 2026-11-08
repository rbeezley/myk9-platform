import type { CheckInStatus } from '@myk9/core';

/**
 * MYK9-1757: the pull source an optimistic check-in change shows until the entries re-read lands.
 * Every optimistic change comes from a person at a secretary surface, so a NEW Pull is staff's
 * (the server stamps the same); a re-Pull (pulled -> pulled) keeps its flagger; leaving 'pulled'
 * forgets the source, as the server does. Without this a spread patch would carry the earlier
 * flagger's source onto a fresh Pull.
 */
export function optimisticPulledBy(
  from: CheckInStatus,
  to: CheckInStatus,
  current: string | null | undefined
): string | null {
  if (to !== 'pulled') return null;
  return from === 'pulled' ? (current ?? null) : 'staff';
}

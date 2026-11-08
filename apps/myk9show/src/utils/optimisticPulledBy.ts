import type { CheckInStatus } from '@myk9/core';

/**
 * MYK9-1757: the pull source an optimistic check-in change shows until the entries re-read lands.
 * The server alone stamps who flagged a pull, so a NEW Pull is unknown (null) here, never a
 * guess and never the earlier flagger carried over by a spread patch. A re-Pull
 * (pulled -> pulled) keeps its flagger, as the server does; leaving 'pulled' forgets the source.
 * The replica's own write path does the same (`withPullSourceInvalidated`).
 */
export function optimisticPulledBy(
  from: CheckInStatus,
  to: CheckInStatus,
  current: string | null | undefined
): string | null {
  return from === 'pulled' && to === 'pulled' ? (current ?? null) : null;
}

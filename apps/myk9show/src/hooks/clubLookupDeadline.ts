import { withTimeout } from '@myk9/core';
import { GUEST_READ_QUERY_OPTIONS } from '@/hooks/guestServerRead';

/**
 * MYK9-2167: the most a club page waits on its lookup before offering Retry,
 * measured from when the query function starts, token retrieval included.
 * Without it the shared guest read waits out two 30 s transport attempts and a
 * 10-15 s pause between them (70-75 s on a stalled connection).
 */
export const CLUB_LOOKUP_DEADLINE_MS = 15_000;

/**
 * The club-detail read's query options: the shared guest options plus no query
 * retry, so the deadline is the whole budget. The Retry button is the retry.
 * Other users of GUEST_READ_QUERY_OPTIONS keep their behaviour.
 */
export const CLUB_LOOKUP_QUERY_OPTIONS = {
  ...GUEST_READ_QUERY_OPTIONS,
  retry: false,
} as const;

/** Runs one club lookup under the overall deadline; a stall rejects with TimeoutError. */
export function withClubLookupDeadline<T>(lookup: () => Promise<T>): Promise<T> {
  return withTimeout(lookup(), CLUB_LOOKUP_DEADLINE_MS, 'Club lookup');
}

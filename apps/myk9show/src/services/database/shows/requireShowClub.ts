import { FriendlySaveError } from '@/utils/friendlySaveError';

/**
 * MYK9-1008: every show belongs to a club. `shows.club_id` is NOT NULL, so a
 * create without one fails at the database with a raw 23502 — or, offline, only
 * when the queued INSERT finally syncs, long after the secretary has moved on.
 * Every create path calls this first, so the refusal happens before any write
 * and reads as a sentence.
 */
export const SHOW_REQUIRES_CLUB_MESSAGE =
  'Choose the club hosting this show before saving it. Every show belongs to a club.';

/** The club id, trimmed; throws a {@link FriendlySaveError} when there is none. */
export function requireShowClubId(clubId: string | null | undefined): string {
  const trimmed = clubId?.trim();
  if (!trimmed) throw new FriendlySaveError(SHOW_REQUIRES_CLUB_MESSAGE);
  return trimmed;
}

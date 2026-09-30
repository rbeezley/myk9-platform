/**
 * MYK9-887: lets the wizard say "you cannot create a show for this club" on the
 * Basics step instead of after the secretary has filled in trials and judges.
 *
 * The rule itself is `canCreateShowForClub` (the same one the club page uses to
 * gate Add Show). It mirrors the server's create-show check and is deliberately
 * NOT the club's publish approval. The RPC stays the authority at submission.
 */
import { useMemo } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { canCreateShowForClub } from '@/components/clubs/ClubDetails/clubPermissions';
import type { UserWithRoles } from '@/types/auth-types';

export const CLUB_CREATE_DENIED_MESSAGE =
  "You don't have permission to create shows for this club. Ask the club's admin to appoint you as a secretary, or choose a club you manage.";

/**
 * Clubs this session just created. The creator's club_admin grant comes from a DB trigger and
 * club creation rides the offline queue, so the grant can land after the wizard is re-entered
 * with the new clubId. Until scopes catch up the answer is "unknown", never "denied": the
 * create-club-and-return path must not block, and the RPC stays authoritative.
 */
const justCreatedClubIds = new Set<string>();

export function markClubJustCreated(clubId: string): void {
  justCreatedClubIds.add(clubId);
}

export function clearJustCreatedClubsForTest(): void {
  justCreatedClubIds.clear();
}

/**
 * True only when the signed-in user is known and holds no create-show grant for the club.
 * An unloaded identity or an unselected club is "unknown", never "denied", so the message
 * cannot flash during a cold boot.
 */
export function isClubShowCreateDenied(
  user: UserWithRoles | null | undefined,
  clubId: string | undefined
): boolean {
  if (!user || !clubId || justCreatedClubIds.has(clubId)) return false;
  return !canCreateShowForClub(user, clubId);
}

export function useClubShowCreateDenied(clubId: string | undefined, enabled = true): boolean {
  const { userWithRoles } = useAuthContext();
  return useMemo(
    () => enabled && isClubShowCreateDenied(userWithRoles, clubId),
    [enabled, userWithRoles, clubId]
  );
}

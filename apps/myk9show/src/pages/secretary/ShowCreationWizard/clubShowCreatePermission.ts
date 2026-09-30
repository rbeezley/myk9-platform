/**
 * MYK9-887: lets the wizard say "you cannot create a show for this club" on the
 * Basics step instead of after the secretary has filled in trials and judges. ADVISORY:
 * it never blocks Next, so a stale scope list cannot strand anyone; the RPC decides.
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
  "You may not have permission to create shows for this club. Ask the club's admin to appoint you as a secretary, or choose a club you manage. You can still continue; the final check happens when you create the show.";

/**
 * True only when the signed-in user is known and holds no create-show grant for the club.
 * An unloaded identity or an unselected club is "unknown", never "denied", so the message
 * cannot flash during a cold boot.
 */
export function isClubShowCreateDenied(
  user: UserWithRoles | null | undefined,
  clubId: string | undefined
): boolean {
  if (!user || !clubId) return false;
  return !canCreateShowForClub(user, clubId);
}

export function useClubShowCreateDenied(clubId: string | undefined, enabled = true): boolean {
  const { userWithRoles } = useAuthContext();
  return useMemo(
    () => enabled && isClubShowCreateDenied(userWithRoles, clubId),
    [enabled, userWithRoles, clubId]
  );
}

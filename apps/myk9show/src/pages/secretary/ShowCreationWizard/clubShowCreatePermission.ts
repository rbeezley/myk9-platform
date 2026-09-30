/**
 * MYK9-887: lets the wizard say "you cannot create a show for this club" on the
 * Basics step instead of after the secretary has filled in trials and judges. ADVISORY:
 * it never blocks Next, so a stale scope list cannot strand anyone; the RPC decides.
 *
 * The rule itself is `canCreateShowForClub` (the same one the club page uses to
 * gate Add Show). It mirrors the server's create-show check and is deliberately
 * NOT the club's publish approval. The RPC stays the authority at submission.
 */
import { useAuthContext } from '@/hooks/useAuthContext';
import { useSearchParams } from 'react-router-dom';
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

/** BrowseClubsPage's create-and-return navigation adds this flag beside `clubId` (MYK9-887). */
export const CLUB_CREATED_PARAM = 'clubCreated';

/**
 * The advisory alert for the wizard. Silent for a club this navigation just created: the
 * creator's club_admin grant is issued server-side after the club uploads, so scopes can lag.
 * URL-scoped on purpose: no module or persisted state.
 */
export function useClubShowCreateDenied(clubId: string | undefined, enabled = true): boolean {
  const { userWithRoles } = useAuthContext();
  const [searchParams] = useSearchParams();
  if (!enabled) return false;
  if (
    clubId &&
    searchParams.get(CLUB_CREATED_PARAM) === '1' &&
    searchParams.get('clubId') === clubId
  )
    return false;
  return isClubShowCreateDenied(userWithRoles, clubId);
}

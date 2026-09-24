/**
 * Secretary/show-manager access at one club (MYK9-571, MYK9-685).
 *
 * A request is an ask; it never grants anything. The club admin's appointment
 * (grant_club_secretary, via approve_club_role_request) remains the only grant.
 */
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import type { Club } from '@/types/club-types';
import {
  getMyClubSecretaryRequestStatus,
  submitClubSecretaryRequest,
} from '@/services/database/role-requests';
import {
  hasClubAdminScope,
  hasClubSecretaryScope,
} from '@/components/clubs/ClubDetails/clubPermissions';
import type { ClubRequestController, ClubRequestState } from './clubRequestState';
import { useClubRequestController } from './useClubRequestController';

export const SECRETARY_REQUEST_QUERY_KEY = 'my-club-secretary-request';

export function useClubSecretaryRequest(club: Pick<Club, 'id' | 'name'>): ClubRequestController {
  const { userWithRoles } = useAuthContext();
  const authUserId = userWithRoles?.id;

  // Someone who can already appoint themselves, or who is already appointed,
  // has nothing to ask for. The page says so; it never renders an empty slot.
  let preState: ClubRequestState | null = null;
  if (!userWithRoles || !authUserId) {
    preState = { kind: 'signed-out' };
  } else if (userWithRoles.roles?.includes(UserRole.SITE_ADMIN)) {
    preState = {
      kind: 'has-access',
      message: 'As a site administrator you can appoint secretaries for any club from Admin.',
    };
  } else if (hasClubAdminScope(userWithRoles.scopes, club.id)) {
    preState = {
      kind: 'has-access',
      message: `You are an admin of ${club.name}, so you can appoint secretaries yourself from Club Members → Show Access.`,
    };
  } else if (hasClubSecretaryScope(userWithRoles.scopes, club.id)) {
    preState = {
      kind: 'has-access',
      message: `You already have secretary and show-manager access for ${club.name}.`,
    };
  }

  return useClubRequestController({
    queryKey: [SECRETARY_REQUEST_QUERY_KEY, club.id, authUserId],
    preState,
    // The AUTH uid, never databaseUserId: role_requests.auth_user_id is auth.users.id.
    fetchStatus: () => getMyClubSecretaryRequestStatus(club.id, authUserId!),
    submitRequest: note => submitClubSecretaryRequest({ clubId: club.id, note }),
    successMessage: 'Request sent. The club can review it from Members > Show Access.',
    logContext: { clubId: club.id, request: 'secretary' },
  });
}

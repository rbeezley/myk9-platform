/**
 * Ordinary membership at one club (MYK9-685). Membership puts the person on
 * the club's roster and grants no secretary/show-management permission; that
 * stays a separate ask and a separate appointment.
 */
import { useAuthContext } from '@/hooks/useAuthContext';
import type { Club } from '@/types/club-types';
import {
  getMyClubMembershipRequestStatus,
  submitClubMembershipRequest,
} from '@/services/database/club-membership-requests';
import type { ClubRequestController } from './clubRequestState';
import { useClubRequestController } from './useClubRequestController';

export const MEMBERSHIP_REQUEST_QUERY_KEY = 'my-club-membership-request';

export function useClubMembershipRequest(club: Pick<Club, 'id' | 'name'>): ClubRequestController {
  const { userWithRoles } = useAuthContext();
  const authUserId = userWithRoles?.id;

  return useClubRequestController({
    queryKey: [MEMBERSHIP_REQUEST_QUERY_KEY, club.id, authUserId],
    preState: authUserId ? null : { kind: 'signed-out' },
    fetchStatus: async () => {
      const result = await getMyClubMembershipRequestStatus(club.id);
      // An approval is only final while the membership is still active. A
      // member who later lapsed, resigned or was removed may ask again (the
      // server allows it), so their old approval must not hide the form.
      const formerMember = result.status === 'approved' && !result.isMember;
      return {
        status: formerMember ? null : result.status,
        reviewerNote: formerMember ? null : result.reviewerNote,
        hasAccessMessage: result.isMember ? `You are already a member of ${club.name}.` : null,
      };
    },
    submitRequest: note => submitClubMembershipRequest({ clubId: club.id, note }),
    successMessage: 'Request sent. The club can review it from Club Members.',
    logContext: { clubId: club.id, request: 'membership' },
  });
}

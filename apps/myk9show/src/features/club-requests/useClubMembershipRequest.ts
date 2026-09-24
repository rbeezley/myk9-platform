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
    // The server returns exactly one state; this is a lookup, not a decision.
    fetchStatus: async () => {
      const { state, reviewerNote } = await getMyClubMembershipRequestStatus(club.id);
      switch (state) {
        case 'member':
          return { kind: 'has-access', message: `You are already a member of ${club.name}.` };
        case 'suspended':
          return {
            kind: 'blocked',
            message: `Your membership in ${club.name} is suspended. Please contact the club directly.`,
          };
        case 'pending':
          return { kind: 'pending' };
        case 'denied':
          return { kind: 'denied', reviewerNote };
        case 'none':
          return { kind: 'available' };
      }
    },
    submitRequest: note => submitClubMembershipRequest({ clubId: club.id, note }),
    successMessage: 'Request sent. The club can review it from Club Members.',
    logContext: { clubId: club.id, request: 'membership' },
  });
}

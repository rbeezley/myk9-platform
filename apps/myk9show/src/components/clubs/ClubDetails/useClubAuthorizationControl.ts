/**
 * MYK9-572: site-admin-only "authorize / revoke" control for a club, on the
 * existing club detail surface (`/clubs/:id`) — no new admin page.
 *
 * Extracted from `useClubDetailsState` so that hook stays under the 500-line
 * ceiling, mirroring how `clubPermissions.ts` was already split out.
 */
import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchClubAuthorization } from '@/features/payments/useClubStripeAccount';
import { setClubAuthorization } from '@/services/database/clubs';
import { notifications } from '@/lib/notifications';
import { getErrorMessage } from '@myk9/core';

export function useClubAuthorizationControl(clubId: string | undefined, isSiteAdmin: boolean) {
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);

  const authQuery = useQuery({
    queryKey: ['club-authorization', clubId],
    queryFn: () => fetchClubAuthorization(clubId!),
    enabled: !!clubId,
  });

  const setAuthorization = useCallback(
    async (authorized: boolean) => {
      if (!clubId) return;
      setIsUpdating(true);
      try {
        await setClubAuthorization(clubId, authorized);
        await queryClient.invalidateQueries({ queryKey: ['club-authorization', clubId] });
        notifications.success(authorized ? 'Club authorized.' : 'Club authorization revoked.');
      } catch (error) {
        notifications.error(getErrorMessage(error) || 'Could not update club authorization.');
      } finally {
        setIsUpdating(false);
      }
    },
    [clubId, queryClient]
  );

  return {
    // Only meaningful for a site admin — the query still runs for any
    // caller who can see the club (clubs_select), but the authorize/revoke
    // AFFORDANCE is gated on isSiteAdmin, matching set_club_authorization's
    // own server-side check.
    canAuthorizeClub: isSiteAdmin,
    isClubAuthorized: authQuery.data?.authorized_at != null,
    isAuthorizationLoading: authQuery.isLoading,
    isAuthorizationUpdating: isUpdating,
    handleAuthorizeClub: () => void setAuthorization(true),
    handleRevokeAuthorization: () => void setAuthorization(false),
  };
}

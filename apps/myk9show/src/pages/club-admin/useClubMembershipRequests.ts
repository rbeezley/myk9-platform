/**
 * Members tab state for club membership requests (MYK9-685): the pending
 * list and approve/deny.
 * Approving adds the person to the roster only — no secretary access.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveClubMembershipRequest,
  denyClubMembershipRequest,
  listClubMembershipRequests,
} from '@/services/database/club-membership-requests';
import { notifications } from '@/lib/notifications';
import type { PendingClubRequestsCopy } from './ClubShowAccessRequests';

const MEMBERSHIP_REQUESTS_COPY: PendingClubRequestsCopy = {
  heading: 'Membership requests',
  unavailableMessage: "We couldn't load pending membership requests.",
  denyDescription:
    'They will not be added to the member list from this request, and cannot resubmit it. You can still add them yourself at any time.',
  denyFieldId: 'deny-membership-request-note',
};

export function useClubMembershipRequests(
  clubId: string | undefined,
  reportMutationFailure: (what: string, error: unknown) => void
) {
  const queryClient = useQueryClient();

  const requestsQuery = useQuery({
    queryKey: ['club-membership-requests', clubId],
    queryFn: () => listClubMembershipRequests(clubId!),
    enabled: !!clubId,
    // An inbox: requests arrive while the admin is elsewhere.
    refetchOnMount: 'always',
  });
  const pendingRequests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);

  const approveMutation = useMutation({
    mutationFn: (requestId: string) => approveClubMembershipRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-membership-requests', clubId] });
      queryClient.invalidateQueries({ queryKey: ['club-members', clubId] });
      notifications.success('Request approved. They are now on the member list.');
    },
    onError: error =>
      reportMutationFailure("We couldn't approve that request. Please try again.", error),
  });

  const denyMutation = useMutation({
    mutationFn: ({ requestId, note }: { requestId: string; note?: string }) =>
      denyClubMembershipRequest(requestId, note ?? null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-membership-requests', clubId] });
      notifications.success('Request denied.');
    },
    onError: error =>
      reportMutationFailure("We couldn't deny that request. Please try again.", error),
  });

  return {
    pendingCount: pendingRequests.length,
    listProps: {
      requests: pendingRequests,
      unavailable: requestsQuery.isError,
      onRetry: () => void requestsQuery.refetch(),
      onApprove: (requestId: string) => approveMutation.mutate(requestId),
      // exactOptionalPropertyTypes: omit `note` rather than pass undefined.
      onDeny: (requestId: string, note?: string) =>
        denyMutation.mutate(note !== undefined ? { requestId, note } : { requestId }),
      isSaving: approveMutation.isPending || denyMutation.isPending,
      copy: MEMBERSHIP_REQUESTS_COPY,
    },
  };
}

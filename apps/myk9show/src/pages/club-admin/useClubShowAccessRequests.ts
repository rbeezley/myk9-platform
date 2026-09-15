/**
 * Show Access tab state for club-routed secretary requests (MYK9-571).
 *
 * Extracted from ClubMembersPage.tsx (CLAUDE.md's 500-line file cap — this
 * PR pushed the page to 753 lines) rather than trimmed: everything here —
 * the pending-requests query, the approve/deny mutations, the deny-note
 * handler, and the tab-def memo that carries the pending-count badge — is
 * specific to this one tab and has no other caller.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Shield, KeyRound } from 'lucide-react';
import type { PrimaryTabDef } from '@/components/common/PrimaryTabs';
import {
  approveClubRoleRequest,
  denyClubRoleRequest,
  listClubRoleRequests,
} from '@/services/database/role-requests';
import { notifications } from '@/lib/notifications';

export function useClubShowAccessRequests(
  clubId: string | undefined,
  reportMutationFailure: (what: string, error: unknown) => void
) {
  const queryClient = useQueryClient();

  // Pending club-scoped secretary requests, shown on the Show Access tab. A
  // failed fetch does not block the rest of the tab — it says so inline,
  // same shape as ClubMembersPage's showManagersQuery.
  const roleRequestsQuery = useQuery({
    queryKey: ['club-role-requests', clubId],
    queryFn: () => listClubRoleRequests(clubId!),
    enabled: !!clubId,
  });

  // Defense in depth (MYK9-571 round 3, P3-5): the RPC's own WHERE clause
  // already filters to status='pending', but the badge/heading here should
  // not depend SOLELY on that — if a future change to the RPC ever widened
  // it (e.g. to also return reviewed requests for a history view), this
  // filter keeps the count and the "who is still waiting" list correct
  // without a client-side change.
  const pendingRoleRequests = useMemo(
    () => (roleRequestsQuery.data ?? []).filter(request => request.status === 'pending'),
    [roleRequestsQuery.data]
  );

  // The Show Access tab strip carries a count badge for pending requests, so
  // a club admin does not have to open the tab to notice one. Memoized (not
  // a module-level constant) because `badge` varies with live data.
  const clubMembersTabs: PrimaryTabDef[] = useMemo(
    () => [
      { id: 'members', label: 'Members', icon: Users },
      { id: 'officers', label: 'Officers', icon: Shield },
      // Separate from Members on purpose: an appointed secretary need not be a member, so
      // this tab can list people the roster structurally cannot.
      {
        id: 'show-access',
        label: 'Show Access',
        icon: KeyRound,
        ...(pendingRoleRequests.length > 0 ? { badge: pendingRoleRequests.length } : {}),
      },
    ],
    [pendingRoleRequests.length]
  );

  // Approving routes through grant_club_secretary (same permission_audit_log
  // row as a direct appointment), so both the requests list and the
  // appointee list need invalidating.
  const approveRoleRequestMutation = useMutation({
    mutationFn: (requestId: string) => approveClubRoleRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-role-requests', clubId] });
      queryClient.invalidateQueries({ queryKey: ['club-show-managers', clubId] });
      notifications.success('Request approved. They can now run this club’s shows.');
    },
    onError: error =>
      reportMutationFailure("We couldn't approve that request. Please try again.", error),
  });

  const denyRoleRequestMutation = useMutation({
    mutationFn: ({ requestId, note }: { requestId: string; note?: string }) =>
      denyClubRoleRequest(requestId, note ?? null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-role-requests', clubId] });
      notifications.success('Request denied.');
    },
    onError: error =>
      reportMutationFailure("We couldn't deny that request. Please try again.", error),
  });

  // NOT collapsed to `mutate({ requestId, note })` (flagged as a dead
  // conditional in review, MYK9-571 round 2 P3-2): this app builds with
  // `exactOptionalPropertyTypes: true`, under which an object literal
  // carrying an explicit `note: undefined` does not satisfy `note?: string`
  // — the key must be OMITTED, not present-with-undefined. Verified by
  // reverting to the one-line form and confirming `pnpm typecheck` fails
  // with TS2379 before restoring this.
  const handleDenyRequest = (requestId: string, note?: string) => {
    denyRoleRequestMutation.mutate(note !== undefined ? { requestId, note } : { requestId });
  };

  // Bundled as one object (rather than six separate return fields) so the
  // page can spread it straight onto ClubShowAccessTab's matching props.
  return {
    clubMembersTabs,
    roleRequestsTabProps: {
      pendingRequests: pendingRoleRequests,
      requestsUnavailable: roleRequestsQuery.isError,
      onRetryRequests: () => void roleRequestsQuery.refetch(),
      onApproveRequest: (requestId: string) => approveRoleRequestMutation.mutate(requestId),
      onDenyRequest: handleDenyRequest,
      isSavingRequest: approveRoleRequestMutation.isPending || denyRoleRequestMutation.isPending,
    },
  };
}

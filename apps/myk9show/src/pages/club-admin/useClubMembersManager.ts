/**
 * State, queries and mutations behind the club members manager (MYK9-1293). Split from
 * ClubMembersManager.tsx for the 500-line cap; the manager renders, this decides.
 */

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUserStore } from '@/store/userStore';
import {
  OFFICER_POSITION_ORDER,
  type MembershipType,
  type MembershipStatus,
  type OfficerPosition,
  type OfficerTarget,
} from '@/types/club-membership-types';
import {
  getClubMembers,
  countActiveClubMembers,
  getClubOfficers,
  addClubMember,
  updateClubMember,
  removeClubMember,
  addClubOfficer,
  removeClubOfficer,
  getClubShowManagers,
  setClubShowManagerAccess,
} from '@/services/database/club-memberships';
import { countUpcomingClubShows } from '@/services/database/clubs';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { queryKeys } from '@/lib/queryClient';
import { useClubShowAccessRequests } from './useClubShowAccessRequests';
import { useClubMembershipRequests } from './useClubMembershipRequests';

export function useClubMembersManager(clubId: string) {
  const queryClient = useQueryClient();
  const { people, loadUsers } = useUserStore();

  const [selectedTab, setSelectedTab] = useState('members');
  // URL-backed so a refresh or shared link keeps the same result set
  // (docs/plan-list-toolkit.md). Independent of `selectedTab`, which stays
  // local state — these two params only mean anything on the Members tab.
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') ?? '';
  const setSearchQuery = (value: string) => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (value) next.set('q', value);
        else next.delete('q');
        return next;
      },
      { replace: true }
    );
  };
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAssignOfficer, setShowAssignOfficer] = useState(false);
  const [showAppointSecretary, setShowAppointSecretary] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{
    kind: 'member' | 'officer';
    id: string;
    name: string;
    hasShowAccess: boolean;
  } | null>(null);
  const [isRemovalOpen, setIsRemovalOpen] = useState(false);
  const [pendingShowAccessRevoke, setPendingShowAccessRevoke] = useState<{
    personId: string;
    personName: string;
  } | null>(null);
  const [isShowAccessRevokeOpen, setIsShowAccessRevokeOpen] = useState(false);

  // Load people on mount for the add-member and appoint dialogs.
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Queries
  const membersQuery = useQuery({
    queryKey: ['club-members', clubId],
    queryFn: () => getClubMembers(clubId),
    enabled: !!clubId,
  });

  const officersQuery = useQuery({
    queryKey: ['club-officers', clubId],
    queryFn: () => getClubOfficers(clubId),
    enabled: !!clubId,
  });

  const showManagersQuery = useQuery({
    queryKey: ['club-show-managers', clubId],
    queryFn: () => getClubShowManagers(clubId),
    enabled: !!clubId,
  });

  // Only read to decide whether revoking the last secretary deserves a warning, so a
  // failure here must not block the tab: it falls back to 0, which shows no warning
  // rather than a wrong one.
  const upcomingShowsQuery = useQuery({
    queryKey: ['club-upcoming-show-count', clubId],
    queryFn: () => countUpcomingClubShows(clubId),
    enabled: !!clubId,
  });

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const activeMemberCount = useMemo(() => countActiveClubMembers(members), [members]);
  const officers = useMemo(() => officersQuery.data ?? [], [officersQuery.data]);
  const showManagers = useMemo(() => showManagersQuery.data ?? [], [showManagersQuery.data]);
  // The roster still annotates member rows, so it still needs the id set — now derived
  // from the same fetch instead of a second RPC.
  const showManagerIds = useMemo(() => new Set(showManagers.map(m => m.personId)), [showManagers]);

  // Sorted officers by position order
  const sortedOfficers = useMemo(() => {
    const positionIndex = Object.fromEntries(OFFICER_POSITION_ORDER.map((p, i) => [p, i]));
    return [...officers].sort(
      (a, b) => (positionIndex[a.position] ?? 99) - (positionIndex[b.position] ?? 99)
    );
  }, [officers]);

  // Mutations
  // A rejected write used to do nothing at all: five of these six mutations
  // defined onSuccess only, so an RLS 42501 or the club_officers UNIQUE
  // violation left the dialog open, the button live, and no message anywhere.
  // toggleShowAccess already did this correctly; this generalises its shape.
  const reportMutationFailure = (what: string, error: unknown) => {
    notifications.error(what);
    logger.error(what, 'club-admin', {
      error: error instanceof Error ? error.message : String(error),
    });
  };

  const addMemberMutation = useMutation({
    mutationFn: (data: { personId: string; membershipType: MembershipType }) =>
      addClubMember({
        clubId: clubId,
        personId: data.personId,
        membershipType: data.membershipType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-members', clubId] });
      setShowAddMember(false);
    },
    onError: error =>
      reportMutationFailure(
        "We couldn't add that member. Check your club access and try again.",
        error
      ),
  });

  const updateMemberMutation = useMutation({
    mutationFn: (data: {
      memberId: string;
      updates: { membershipType?: MembershipType; membershipStatus?: MembershipStatus };
    }) => updateClubMember(data.memberId, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-members', clubId] });
      // Show access is not invalidated here: membership status no longer affects it.
      // Only toggleShowAccessMutation can change who manages this club's shows.
    },
    onError: error =>
      reportMutationFailure("We couldn't update that member. Please try again.", error),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => removeClubMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-members', clubId] });
      // Deliberately NOT invalidating show managers. Removing a membership used to
      // end show access, because every secretary predicate gated on
      // is_active_club_member(). Appointment is now the only grant, so the
      // person keeps managing this club's shows until the appointment is revoked.
    },
    onError: error =>
      reportMutationFailure("We couldn't remove that member. Please try again.", error),
  });

  const addOfficerMutation = useMutation({
    mutationFn: (data: OfficerTarget & { position: string }) =>
      addClubOfficer({
        clubId: clubId,
        ...('personId' in data ? { personId: data.personId } : { displayName: data.displayName }),
        position: data.position as OfficerPosition,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-officers', clubId] });
      setShowAssignOfficer(false);
    },
    onError: error =>
      reportMutationFailure(
        // club_officers carries UNIQUE(club_id, person_id, position) (and the same for a
        // typed name), so the reachable failure is a duplicate assignment. Name it rather
        // than reporting a generic problem the admin cannot act on.
        'That person already holds this position, or we could not save the change.',
        error
      ),
  });

  const removeOfficerMutation = useMutation({
    mutationFn: (officerId: string) => removeClubOfficer(officerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-officers', clubId] });
    },
    onError: error =>
      reportMutationFailure("We couldn't remove that officer. Please try again.", error),
  });

  const toggleShowAccessMutation = useMutation({
    mutationFn: ({
      personId,
      grant,
    }: {
      personId: string;
      grant: boolean;
      personName?: string | undefined;
    }) => setClubShowManagerAccess({ personId, clubId: clubId, grant }),
    onSuccess: (_, { personId, grant, personName }) => {
      queryClient.invalidateQueries({ queryKey: ['club-show-managers', clubId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.clubOfficials(clubId) });
      // The name has to be supplied by the caller now. Resolving it from `members`
      // fails for exactly the people this feature added — a non-member appointee has
      // no roster row — and the fallback called them "the member", which is both
      // anonymous and the one thing they are not.
      const name =
        personName ??
        members.find(member => member.personId === personId)?.personName ??
        showManagers.find(manager => manager.personId === personId)?.personName ??
        'that person';
      notifications.success(
        `Show secretary role ${grant ? 'granted to' : 'revoked from'} ${name}.`
      );
      logger.info(`Show access ${grant ? 'granted to' : 'revoked from'} ${personId}`, 'club-admin');
    },
    onError: (error, { grant }) => {
      notifications.error(
        `We couldn't ${grant ? 'grant' : 'revoke'} the show secretary role. Check your club access and try again.`
      );
      logger.error(`Failed to ${grant ? 'grant' : 'revoke'} show access`, 'club-admin', {
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });

  // MYK9-571 / MYK9-685: request state and mutations live in their own hooks.
  const membershipRequests = useClubMembershipRequests(clubId, reportMutationFailure);
  const { clubMembersTabs, roleRequestsTabProps } = useClubShowAccessRequests(
    clubId,
    reportMutationFailure,
    membershipRequests.pendingCount
  );

  // Handlers
  const handleChangeType = (memberId: string, membershipType: MembershipType) => {
    updateMemberMutation.mutate({ memberId, updates: { membershipType } });
  };

  const handleChangeStatus = (memberId: string, membershipStatus: MembershipStatus) => {
    updateMemberMutation.mutate({ memberId, updates: { membershipStatus } });
  };

  // Removal is a hard DELETE of the person's membership record - join date,
  // dues history, voting eligibility. It no longer ends show access: appointment
  // is a separate grant, so the dialog says so rather than letting an admin
  // assume the two travel together. It sat one row below "Resigned" in the same menu
  // with no confirmation, no undo and no message. PRODUCT.md rules out confirm
  // dialogs for ROUTINE actions; permanently deleting a person's club record
  // is not routine.
  const handleRemoveMember = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    setIsRemovalOpen(true);
    setPendingRemoval(
      member
        ? {
            kind: 'member',
            id: memberId,
            name: member.personName || 'this member',
            hasShowAccess: member.personId ? showManagerIds.has(member.personId) : false,
          }
        : { kind: 'member', id: memberId, name: 'this member', hasShowAccess: false }
    );
  };

  const handleRemoveOfficer = (officerId: string) => {
    const officer = officers.find(o => o.id === officerId);
    setIsRemovalOpen(true);
    setPendingRemoval({
      kind: 'officer',
      id: officerId,
      name: officer?.personName || 'this officer',
      hasShowAccess: false,
    });
  };

  const confirmRemoval = () => {
    if (!pendingRemoval) return;
    if (pendingRemoval.kind === 'member') removeMemberMutation.mutate(pendingRemoval.id);
    else removeOfficerMutation.mutate(pendingRemoval.id);
    // Only the open flag flips. pendingRemoval stays populated so the dialog
    // body still reads correctly through its 200ms exit animation - clearing it
    // here put the literal string "undefined" in the title on every removal.
    setIsRemovalOpen(false);
  };

  const handleToggleShowAccess = (personId: string, grant: boolean, personName?: string) => {
    if (!grant) {
      const resolvedName =
        personName ??
        members.find(member => member.personId === personId)?.personName ??
        showManagers.find(manager => manager.personId === personId)?.personName ??
        'this person';
      setPendingShowAccessRevoke({ personId, personName: resolvedName });
      setIsShowAccessRevokeOpen(true);
      return;
    }
    toggleShowAccessMutation.mutate({ personId, grant, personName });
  };

  const confirmShowAccessRevoke = () => {
    if (!pendingShowAccessRevoke) return;
    toggleShowAccessMutation.mutate({
      personId: pendingShowAccessRevoke.personId,
      grant: false,
      personName: pendingShowAccessRevoke.personName,
    });
    setIsShowAccessRevokeOpen(false);
  };

  const handleAppointSecretary = (personId: string) => {
    const person = people.find(candidate => candidate.id === personId);
    const personName = person ? `${person.firstName} ${person.lastName}`.trim() : undefined;
    toggleShowAccessMutation.mutate(
      { personId, grant: true, personName },
      { onSuccess: () => setShowAppointSecretary(false) }
    );
  };

  const existingMemberPersonIds = useMemo(() => new Set(members.map(m => m.personId)), [members]);

  const rosterLoading =
    membersQuery.isLoading || officersQuery.isLoading || showManagersQuery.isLoading;
  // Only a failed MEMBERS load blanks the page. The other two are narrower:
  // officers populate a different tab, and show-managers annotate one column.
  // Letting either take the whole page down is a worse trade than the bug it
  // was fixing - the roster that loaded fine disappears, and
  // getClubShowManagerIds is the narrowest and most RLS-sensitive of the three,
  // so it is the likeliest to fail. They still must not render absence as fact;
  // they say so inline instead.
  // A query paused for lack of a connection with nothing cached has not answered: that is
  // unavailable, never an empty result.
  const neverAnswered = (query: { isError: boolean; fetchStatus: string; data: unknown }) =>
    query.isError || (query.fetchStatus === 'paused' && query.data === undefined);
  const rosterError = neverAnswered(membersQuery);
  const officersUnavailable = neverAnswered(officersQuery);
  const showAccessUnavailable = neverAnswered(showManagersQuery);

  const retryRoster = () => {
    if (neverAnswered(membersQuery)) void membersQuery.refetch();
    if (neverAnswered(officersQuery)) void officersQuery.refetch();
    if (showManagersQuery && neverAnswered(showManagersQuery)) void showManagersQuery.refetch();
  };

  return {
    people,
    selectedTab,
    setSelectedTab,
    searchQuery,
    setSearchQuery,
    showAddMember,
    setShowAddMember,
    showAssignOfficer,
    setShowAssignOfficer,
    showAppointSecretary,
    setShowAppointSecretary,
    removalDialogs: {
      isRemovalOpen,
      setIsRemovalOpen,
      pendingRemoval,
      confirmRemoval,
      isShowAccessRevokeOpen,
      setIsShowAccessRevokeOpen,
      pendingShowAccessRevoke,
      // Revoking the only secretary of a club with upcoming shows leaves them with nobody to run
      // them; the confirm says so, from the row menu as well as the Show secretaries tab.
      lastSecretaryShowCount:
        showManagers.length === 1 && showManagers[0]?.personId === pendingShowAccessRevoke?.personId
          ? (upcomingShowsQuery.data ?? 0)
          : 0,
      confirmShowAccessRevoke,
    },
    membersQuery,
    officersQuery,
    showManagersQuery,
    upcomingShowsQuery,
    members,
    activeMemberCount,
    officers,
    showManagers,
    showManagerIds,
    sortedOfficers,
    addMemberMutation,
    addOfficerMutation,
    toggleShowAccessMutation,
    membershipRequests,
    clubMembersTabs,
    roleRequestsTabProps,
    handleChangeType,
    handleChangeStatus,
    handleRemoveMember,
    handleRemoveOfficer,
    handleToggleShowAccess,
    handleAppointSecretary,
    existingMemberPersonIds,
    rosterLoading,
    rosterError,
    officersUnavailable,
    showAccessUnavailable,
    retryRoster,
  };
}

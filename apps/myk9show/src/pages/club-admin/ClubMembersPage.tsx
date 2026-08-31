/**
 * Club Members Page — Club Admin Member Management
 *
 * Allows club admins to manage members and officers for their club.
 * Auto-detects the admin's club from auth context scopes.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { PageTransition } from '@/components/common/PageTransition';
import { TableSkeleton } from '@/components/common/SkeletonLoaders';
import { Users, Plus, Shield, Search, AlertTriangle } from 'lucide-react';
import { useClubStore } from '@/store/clubStore';
import { useUserStore } from '@/store/userStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCurrentValidatedClubContext } from '@/hooks/useValidatedClubContext';
import { ClubContextGate } from '@/components/club-admin/ClubContextGate';
import { ClubSwitcher } from '@/components/club-admin/ClubSwitcher';
import {
  OFFICER_POSITION_ORDER,
  type MembershipType,
  type MembershipStatus,
  type OfficerPosition,
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
  getClubShowManagerIds,
  setClubShowManagerAccess,
} from '@/services/database/club-memberships';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { AddMemberDialog, AssignOfficerDialog } from './ClubMemberDialogs';
import { MembersTable, OfficersTable } from './ClubMemberTables';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const CLUB_MEMBERS_TABS: PrimaryTabDef[] = [
  { id: 'members', label: 'Members', icon: Users },
  { id: 'officers', label: 'Officers', icon: Shield },
];

// --- Main Page ---

const ClubMembersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const clubContext = useCurrentValidatedClubContext();
  const selectClub = useClubStore(state => state.selectClub);
  const { user } = useAuthContext();
  const handleSelectClub = (id: string) => selectClub(id, user?.id ?? null);
  const ensureClubsReady = useClubStore(state => state.ensureClubsReady);
  const { people, loadUsers } = useUserStore();

  const [selectedTab, setSelectedTab] = useState('members');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAssignOfficer, setShowAssignOfficer] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{
    kind: 'member' | 'officer';
    id: string;
    name: string;
    hasShowAccess: boolean;
  } | null>(null);
  const [isRemovalOpen, setIsRemovalOpen] = useState(false);

  const clubId = clubContext.status === 'ready' ? clubContext.clubId : undefined;
  const clubName = clubContext.status === 'ready' ? clubContext.clubName : 'Club';

  // Load the narrow public club replica and people on mount. Cached club data
  // does not validate this page until the current-session freshness check wins.
  useEffect(() => {
    void ensureClubsReady();
    loadUsers();
  }, [ensureClubsReady, loadUsers]);

  // Queries
  const membersQuery = useQuery({
    queryKey: ['club-members', clubId],
    queryFn: () => getClubMembers(clubId!),
    enabled: !!clubId,
  });

  const officersQuery = useQuery({
    queryKey: ['club-officers', clubId],
    queryFn: () => getClubOfficers(clubId!),
    enabled: !!clubId,
  });

  const showManagersQuery = useQuery({
    queryKey: ['club-show-managers', clubId],
    queryFn: () => getClubShowManagerIds(clubId!),
    enabled: !!clubId,
  });

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const activeMemberCount = useMemo(() => countActiveClubMembers(members), [members]);
  const officers = useMemo(() => officersQuery.data ?? [], [officersQuery.data]);
  const showManagerIds = useMemo(
    () => showManagersQuery.data ?? new Set<string>(),
    [showManagersQuery.data]
  );

  // Sorted officers by position order
  const sortedOfficers = useMemo(() => {
    const positionIndex = Object.fromEntries(OFFICER_POSITION_ORDER.map((p, i) => [p, i]));
    return [...officers].sort(
      (a, b) => (positionIndex[a.position] ?? 99) - (positionIndex[b.position] ?? 99)
    );
  }, [officers]);

  // Filtered members
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter(
      m => m.personName?.toLowerCase().includes(q) || m.personEmail?.toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

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
        clubId: clubId!,
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
    mutationFn: (data: { personId: string; position: string }) =>
      addClubOfficer({
        clubId: clubId!,
        personId: data.personId,
        position: data.position as OfficerPosition,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-officers', clubId] });
      setShowAssignOfficer(false);
    },
    onError: error =>
      reportMutationFailure(
        // club_officers carries UNIQUE(club_id, person_id, position), so the
        // reachable failure is a duplicate assignment. Name it rather than
        // reporting a generic problem the admin cannot act on.
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
    mutationFn: ({ personId, grant }: { personId: string; grant: boolean }) =>
      setClubShowManagerAccess({ personId, clubId: clubId!, grant }),
    onSuccess: (_, { personId, grant }) => {
      queryClient.invalidateQueries({ queryKey: ['club-show-managers', clubId] });
      const memberName = members.find(member => member.personId === personId)?.personName;
      notifications.success(
        `Show access ${grant ? 'granted to' : 'revoked from'} ${memberName || 'the member'}.`
      );
      logger.info(`Show access ${grant ? 'granted to' : 'revoked from'} ${personId}`, 'club-admin');
    },
    onError: (error, { grant }) => {
      notifications.error(
        `We couldn't ${grant ? 'grant' : 'revoke'} show access. Check your club access and try again.`
      );
      logger.error(`Failed to ${grant ? 'grant' : 'revoke'} show access`, 'club-admin', {
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });

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

  const handleToggleShowAccess = (personId: string, grant: boolean) => {
    toggleShowAccessMutation.mutate({ personId, grant });
  };

  const existingMemberPersonIds = useMemo(() => new Set(members.map(m => m.personId)), [members]);

  if (clubContext.status !== 'ready') {
    return (
      <PageTransition>
        <ClubContextGate
          context={clubContext}
          surface="members"
          onRetry={() => void ensureClubsReady({ force: true })}
          onSelectClub={handleSelectClub}
        />
      </PageTransition>
    );
  }

  // All three queries gate the page, not just members. officersQuery and
  // showManagersQuery were rendered through `?? []` / `?? new Set()`, so the
  // moment members resolved the page asserted "0 officers" and dropped the
  // Show Manager badge from everyone who holds it - and on a failed fetch that
  // wrong answer was permanent, with no error state and no retry. A query is
  // not answered just because it is not loading (the PR #1697 class).
  const rosterLoading =
    membersQuery.isLoading || officersQuery.isLoading || showManagersQuery.isLoading;
  // Only a failed MEMBERS load blanks the page. The other two are narrower:
  // officers populate a different tab, and show-managers annotate one column.
  // Letting either take the whole page down is a worse trade than the bug it
  // was fixing - the roster that loaded fine disappears, and
  // getClubShowManagerIds is the narrowest and most RLS-sensitive of the three,
  // so it is the likeliest to fail. They still must not render absence as fact;
  // they say so inline instead.
  const rosterError = membersQuery.isError;
  const officersUnavailable = officersQuery.isError;
  const showAccessUnavailable = showManagersQuery.isError;

  const retryRoster = () => {
    if (membersQuery.isError) void membersQuery.refetch();
    if (officersQuery.isError) void officersQuery.refetch();
    if (showManagersQuery.isError) void showManagersQuery.refetch();
  };

  // Loading state
  if (rosterLoading) {
    return (
      <PageTransition>
        <div role="status" aria-label="Loading club members" className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-muted" />
            </div>
            <div className="h-10 w-32 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
          <TableSkeleton rows={5} columns={4} />
        </div>
      </PageTransition>
    );
  }

  // Error state — distinguish a failed load from a genuinely empty roster, so an
  // admin never mistakes "couldn't load" for "no members yet".
  if (rosterError) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="border-border ">
            <CardContent className="pt-6 flex flex-col items-center text-center max-w-sm">
              <div className="bg-destructive/10 rounded-full p-4 mb-4">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">
                We couldn&apos;t load your roster
              </h2>
              <p className="text-muted-foreground mb-4">
                Something went wrong reaching the roster. Check your connection and try again.
              </p>
              <Button onClick={retryRoster}>Try again</Button>
            </CardContent>
          </Card>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: 'Clubs', href: '/clubs' },
            { label: clubName, href: `/clubs/${clubId}` },
            { label: 'Members', isCurrentPage: true },
          ]}
        />

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[color:var(--chip-stone-bg)] rounded-xl">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {clubName} Members
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  {activeMemberCount} active member{activeMemberCount !== 1 ? 's' : ''}
                </Badge>
                {/* No count while the officers query is failed: `officers`
                    falls back to [] there, and "0 officers" is a claim we
                    cannot support. */}
                <Badge className="bg-[color:var(--chip-stone-bg)] text-[color:var(--chip-stone-fg)] border-transparent hover:bg-[color:var(--chip-stone-bg)]">
                  {officersUnavailable
                    ? 'Officers unavailable'
                    : `${officers.length} officer${officers.length !== 1 ? 's' : ''}`}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Renders nothing for a single club. Without it, choosing a club is
                a one-way door — the gate never shows again (MYK9-138). */}
            <ClubSwitcher
              clubs={clubContext.clubs}
              selectedClubId={clubContext.clubId}
              onSelectClub={handleSelectClub}
            />
            <Button onClick={() => setShowAddMember(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Member
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Card className="border border-border rounded-2xl shadow-sm ">
          <CardContent className="p-6">
            <PrimaryTabs
              tabs={CLUB_MEMBERS_TABS}
              value={selectedTab}
              onValueChange={setSelectedTab}
            >
              {/* Members Tab */}
              <TabsContent value="members" className="mt-6 space-y-4">
                {showAccessUnavailable && (
                  <p
                    role="status"
                    className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
                  >
                    We couldn&apos;t check show access just now, so that column may be incomplete.
                    Everything else on this roster is current.
                  </p>
                )}
                {/* Search */}
                <div className="relative max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    aria-label="Search members by name or email"
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9 border-border"
                  />
                </div>

                {/* Members Table */}
                <MembersTable
                  members={filteredMembers}
                  showManagerIds={showManagerIds}
                  searchQuery={searchQuery}
                  onAddMember={() => setShowAddMember(true)}
                  onChangeType={handleChangeType}
                  onChangeStatus={handleChangeStatus}
                  onRemove={handleRemoveMember}
                  onToggleShowAccess={handleToggleShowAccess}
                />
              </TabsContent>

              {/* Officers Tab */}
              <TabsContent value="officers" className="mt-6 space-y-4">
                {officersUnavailable && (
                  <p
                    role="status"
                    className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
                  >
                    We couldn&apos;t load the officers list. This isn&apos;t the same as the club
                    having none.{' '}
                    <button
                      type="button"
                      onClick={() => void officersQuery.refetch()}
                      className="underline underline-offset-2"
                    >
                      Try again
                    </button>
                  </p>
                )}
                <div className="flex justify-end">
                  <Button onClick={() => setShowAssignOfficer(true)}>
                    <Shield className="h-4 w-4 mr-2" />
                    Assign Officer
                  </Button>
                </div>

                {/* Suppressed entirely on failure - its empty state says "No
                    Officers Assigned", which would confirm as fact the thing
                    the notice above says we could not check. */}
                {!officersUnavailable && (
                  <OfficersTable
                    officers={sortedOfficers}
                    onAssignOfficer={() => setShowAssignOfficer(true)}
                    onRemoveOfficer={handleRemoveOfficer}
                  />
                )}
              </TabsContent>
            </PrimaryTabs>
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      {/* AlertDialogContent animates out over 200ms, so it stays mounted after
          pendingRemoval is cleared. Rendering the body from the live value put
          the literal string "undefined" in the title on every confirm AND every
          cancel, and flipped an officer removal to the member wording mid-fade.
          Render from the last non-null value instead. */}
      <AlertDialog open={isRemovalOpen} onOpenChange={open => !open && setIsRemovalOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRemoval?.kind === 'officer'
                ? `Remove ${pendingRemoval?.name} from this position?`
                : `Remove ${pendingRemoval?.name} from the club?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval?.kind === 'officer'
                ? 'The officer record is deleted. Their club membership is not affected.'
                : 'Their membership record, join date and dues history are deleted.'}
              {pendingRemoval?.kind === 'member' && pendingRemoval?.hasShowAccess
                ? ' Their show access is separate and is NOT removed — they stay an appointed secretary and can still run this club’s shows. Revoke show access as well if that is what you intend.'
                : ''}{' '}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoval}>
              {pendingRemoval?.kind === 'officer' ? 'Remove officer' : 'Remove member'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddMemberDialog
        open={showAddMember}
        onClose={() => setShowAddMember(false)}
        onSave={(personId, membershipType) =>
          addMemberMutation.mutate({ personId, membershipType })
        }
        people={people}
        existingMemberIds={existingMemberPersonIds}
        isSaving={addMemberMutation.isPending}
      />

      <AssignOfficerDialog
        open={showAssignOfficer}
        onClose={() => setShowAssignOfficer(false)}
        onSave={(personId, position) => addOfficerMutation.mutate({ personId, position })}
        members={members}
        people={people}
        isSaving={addOfficerMutation.isPending}
      />
    </PageTransition>
  );
};

export default ClubMembersPage;

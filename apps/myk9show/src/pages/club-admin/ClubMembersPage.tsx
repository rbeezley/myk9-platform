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
import { Users, Plus, Shield, Search, AlertTriangle } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useClubStore } from '@/store/clubStore';
import { useUserStore } from '@/store/userStore';
import { ScopeType, UserRole } from '@/types/auth-types';
import {
  OFFICER_POSITION_ORDER,
  type MembershipType,
  type MembershipStatus,
  type OfficerPosition,
} from '@/types/club-membership-types';
import {
  getClubMembers,
  getClubOfficers,
  addClubMember,
  updateClubMember,
  removeClubMember,
  addClubOfficer,
  removeClubOfficer,
  getClubShowManagerIds,
} from '@/services/database/club-memberships';
import { rbacService } from '@/services/rbac/RBACService';
import { logger } from '@/services/LoggingService';
import { AddMemberDialog, AssignOfficerDialog } from './ClubMemberDialogs';
import { MembersTable, OfficersTable } from './ClubMemberTables';

const CLUB_MEMBERS_TABS: PrimaryTabDef[] = [
  { id: 'members', label: 'Members', icon: Users },
  { id: 'officers', label: 'Officers', icon: Shield },
];

// --- Main Page ---

const ClubMembersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { userWithRoles } = useAuthContext();
  const { clubs, loadClubs } = useClubStore();
  const { people, loadUsers } = useUserStore();

  const [selectedTab, setSelectedTab] = useState('members');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAssignOfficer, setShowAssignOfficer] = useState(false);

  // Detect club from auth scopes
  const clubId = useMemo(
    () =>
      userWithRoles?.scopes?.find(
        s => s.scopeType === ScopeType.CLUB && s.roleId === UserRole.CLUB_ADMIN
      )?.scopeId,
    [userWithRoles?.scopes]
  );

  const club = useMemo(() => clubs.find(c => c.id === clubId), [clubs, clubId]);

  // Load clubs and people on mount
  useEffect(() => {
    loadClubs();
    loadUsers();
  }, [loadClubs, loadUsers]);

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
  });

  const updateMemberMutation = useMutation({
    mutationFn: (data: {
      memberId: string;
      updates: { membershipType?: MembershipType; membershipStatus?: MembershipStatus };
    }) => updateClubMember(data.memberId, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-members', clubId] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => removeClubMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-members', clubId] });
    },
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
  });

  const removeOfficerMutation = useMutation({
    mutationFn: (officerId: string) => removeClubOfficer(officerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-officers', clubId] });
    },
  });

  const toggleShowAccessMutation = useMutation({
    mutationFn: async ({ personId, grant }: { personId: string; grant: boolean }) => {
      if (grant) {
        await rbacService.ensureUserHasRole(personId, UserRole.SECRETARY, { clubId: clubId! });
      } else {
        await rbacService.revokeRole({
          userId: personId,
          roleName: UserRole.SECRETARY,
          scopeType: ScopeType.CLUB,
          scopeId: clubId!,
        });
      }
    },
    onSuccess: (_, { personId, grant }) => {
      queryClient.invalidateQueries({ queryKey: ['club-show-managers', clubId] });
      logger.info(`Show access ${grant ? 'granted to' : 'revoked from'} ${personId}`, 'club-admin');
    },
    onError: (error, { grant }) => {
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

  const handleRemoveMember = (memberId: string) => {
    removeMemberMutation.mutate(memberId);
  };

  const handleToggleShowAccess = (personId: string, grant: boolean) => {
    toggleShowAccessMutation.mutate({ personId, grant });
  };

  const existingMemberPersonIds = useMemo(() => new Set(members.map(m => m.personId)), [members]);

  // No club found state
  if (!clubId) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="bg-gradient-to-br from-card to-card/80 border-border/50 backdrop-blur-xl">
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">
                No club admin scope found. You need club admin permissions to manage members.
              </p>
            </CardContent>
          </Card>
        </div>
      </PageTransition>
    );
  }

  // Loading state
  if (membersQuery.isLoading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"
            role="status"
            aria-label="Loading members"
          />
        </div>
      </PageTransition>
    );
  }

  // Error state — distinguish a failed load from a genuinely empty roster, so an
  // admin never mistakes "couldn't load" for "no members yet".
  if (membersQuery.isError) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="bg-gradient-to-br from-card to-card/80 border-border/50 backdrop-blur-xl">
            <CardContent className="pt-6 flex flex-col items-center text-center max-w-sm">
              <div className="bg-destructive/10 rounded-full p-4 mb-4">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">
                We couldn&apos;t load your members
              </h2>
              <p className="text-muted-foreground mb-4">
                Something went wrong reaching the roster. Check your connection and try again.
              </p>
              <Button onClick={() => membersQuery.refetch()}>Try again</Button>
            </CardContent>
          </Card>
        </div>
      </PageTransition>
    );
  }

  const clubName = club?.name ?? 'Club';

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
            <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {clubName} Members
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  {members.length} member{members.length !== 1 ? 's' : ''}
                </Badge>
                <Badge className="bg-muted text-muted-foreground border-border">
                  {officers.length} officer{officers.length !== 1 ? 's' : ''}
                </Badge>
              </div>
            </div>
          </div>
          <Button onClick={() => setShowAddMember(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Member
          </Button>
        </div>

        {/* Tabs */}
        <Card className="bg-gradient-to-br from-card to-card/80 border border-border/50 rounded-2xl shadow-sm backdrop-blur-xl">
          <CardContent className="p-6">
            <PrimaryTabs
              tabs={CLUB_MEMBERS_TABS}
              value={selectedTab}
              onValueChange={setSelectedTab}
            >

              {/* Members Tab */}
              <TabsContent value="members" className="mt-6 space-y-4">
                {/* Search */}
                <div className="relative max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9 bg-muted/30 border-border/50"
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
                <div className="flex justify-end">
                  <Button onClick={() => setShowAssignOfficer(true)}>
                    <Shield className="h-4 w-4 mr-2" />
                    Assign Officer
                  </Button>
                </div>

                <OfficersTable
                  officers={sortedOfficers}
                  onAssignOfficer={() => setShowAssignOfficer(true)}
                  onRemoveOfficer={officerId => removeOfficerMutation.mutate(officerId)}
                />
              </TabsContent>
            </PrimaryTabs>
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
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

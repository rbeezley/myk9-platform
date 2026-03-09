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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { PageTransition } from '@/components/common/PageTransition';
import { Users, UserPlus, Shield, Search, Trash2, KeyRound } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useClubStore } from '@/store/clubStore';
import { useUserStore } from '@/store/userStore';
import { ScopeType, UserRole } from '@/types/auth-types';
import {
  MEMBERSHIP_TYPE_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  OFFICER_POSITION_LABELS,
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
} from '@/services/database/queries/clubMembershipQueries';
import { rbacService } from '@/services/rbac/RBACService';
import { logger } from '@/services/LoggingService';
import {
  AddMemberDialog,
  AssignOfficerDialog,
  MemberActionMenu,
  TYPE_BADGE_CLASSES,
  STATUS_BADGE_CLASSES,
} from './ClubMemberDialogs';
import { format } from 'date-fns';

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
        await rbacService.ensureUserHasRole(personId, UserRole.SECRETARY, clubId!);
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
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
            <UserPlus className="h-4 w-4 mr-2" />
            Add Member
          </Button>
        </div>

        {/* Tabs */}
        <Card className="bg-gradient-to-br from-card to-card/80 border border-border/50 rounded-2xl shadow-sm backdrop-blur-xl">
          <CardContent className="p-6">
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList className="grid w-full grid-cols-2 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1">
                <TabsTrigger
                  value="members"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Members
                </TabsTrigger>
                <TabsTrigger
                  value="officers"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
                >
                  <Shield className="h-4 w-4 mr-2" />
                  Officers
                </TabsTrigger>
              </TabsList>

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
                <div className="overflow-x-auto rounded-xl border border-border/30">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/30 bg-muted/20">
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                          Name
                        </th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden sm:table-cell">
                          Email
                        </th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                          Type
                        </th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                          Status
                        </th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">
                          Joined
                        </th>
                        <th className="text-right px-4 py-3 font-semibold text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMembers.map(member => (
                        <tr
                          key={member.id}
                          className="border-b border-border/20 hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 py-3 font-medium text-foreground">
                            <span className="flex items-center gap-2">
                              {member.personName || 'Unknown'}
                              {showManagerIds.has(member.personId) && (
                                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">
                                  <KeyRound className="h-3 w-3 mr-1" />
                                  Show Manager
                                </Badge>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                            {member.personEmail || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={TYPE_BADGE_CLASSES[member.membershipType]}>
                              {MEMBERSHIP_TYPE_LABELS[member.membershipType]}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={STATUS_BADGE_CLASSES[member.membershipStatus]}>
                              {MEMBERSHIP_STATUS_LABELS[member.membershipStatus]}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                            {member.joinedDate
                              ? format(new Date(member.joinedDate), 'MMM d, yyyy')
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <MemberActionMenu
                              member={member}
                              hasShowAccess={showManagerIds.has(member.personId)}
                              onChangeType={handleChangeType}
                              onChangeStatus={handleChangeStatus}
                              onRemove={handleRemoveMember}
                              onToggleShowAccess={handleToggleShowAccess}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Empty state */}
                  {filteredMembers.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="bg-muted/50 rounded-full p-6 mb-4">
                        <Users className="h-12 w-12 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2 text-foreground">
                        {searchQuery ? 'No Members Found' : 'No Members Yet'}
                      </h3>
                      <p className="text-muted-foreground mb-4 text-center max-w-sm">
                        {searchQuery
                          ? 'Try adjusting your search terms.'
                          : 'Add your first club member to get started.'}
                      </p>
                      {!searchQuery && (
                        <Button onClick={() => setShowAddMember(true)}>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add Member
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Officers Tab */}
              <TabsContent value="officers" className="mt-6 space-y-4">
                <div className="flex justify-end">
                  <Button onClick={() => setShowAssignOfficer(true)}>
                    <Shield className="h-4 w-4 mr-2" />
                    Assign Officer
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border/30">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/30 bg-muted/20">
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                          Position
                        </th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                          Name
                        </th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden sm:table-cell">
                          Email
                        </th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">
                          Term
                        </th>
                        <th className="text-right px-4 py-3 font-semibold text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedOfficers.map(officer => (
                        <tr
                          key={officer.id}
                          className="border-b border-border/20 hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <Badge className="bg-primary/10 text-primary border-primary/20">
                              {OFFICER_POSITION_LABELS[officer.position]}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground">
                            {officer.personName || 'Unknown'}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                            {officer.personEmail || '—'}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                            {officer.termStart && officer.termEnd
                              ? `${format(new Date(officer.termStart), 'MMM yyyy')} - ${format(new Date(officer.termEnd), 'MMM yyyy')}`
                              : officer.termStart
                                ? `From ${format(new Date(officer.termStart), 'MMM yyyy')}`
                                : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => removeOfficerMutation.mutate(officer.id)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-error-red hover:bg-error-red/10 transition-colors"
                              title="Remove from position"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Empty state */}
                  {sortedOfficers.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="bg-muted/50 rounded-full p-6 mb-4">
                        <Shield className="h-12 w-12 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2 text-foreground">
                        No Officers Assigned
                      </h3>
                      <p className="text-muted-foreground mb-4 text-center max-w-sm">
                        Assign officers to manage club positions.
                      </p>
                      <Button onClick={() => setShowAssignOfficer(true)}>
                        <Shield className="h-4 w-4 mr-2" />
                        Assign Officer
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
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

/**
 * Club members manager: the club admin's roster, officers and show-access tools, rendered as the
 * Members tab of the club page for the admin of THAT club (MYK9-1293, one concern one page).
 * Everyone else keeps the read-only MembersTab.
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs } from '@/components/common/PrimaryTabs';
import { TableSkeleton } from '@/components/common/SkeletonLoaders';
import {
  ListFilterBar,
  ListResultLine,
  ListViewTabs,
  patchSearchParams,
} from '@/components/list-toolkit';
import { Plus, Shield, AlertTriangle } from 'lucide-react';
import { AddMemberDialog, AssignOfficerDialog } from './ClubMemberDialogs';
import { ClubShowAccessRequests } from './ClubShowAccessRequests';
import { MembersTable, OfficersTable } from './ClubMemberTables';
import { ClubShowAccessTab, AppointSecretaryDialog } from './ClubShowAccessTab';
import { ClubRemovalDialogs } from './ClubRemovalDialogs';
import { useClubMembersManager } from './useClubMembersManager';
import type { MemberStatusFilter } from './clubMemberListViews';

const MEMBER_NOUN = ['member', 'members'] as const;

interface ClubMembersManagerProps {
  clubId: string;
  clubName: string;
}

export const ClubMembersManager: React.FC<ClubMembersManagerProps> = ({ clubId, clubName }) => {
  const {
    people,
    selectedTab,
    setSelectedTab,
    searchQuery,
    setSearchQuery,
    memberStatus,
    setMemberStatus,
    setSearchParams,
    showAddMember,
    setShowAddMember,
    showAssignOfficer,
    setShowAssignOfficer,
    showAppointSecretary,
    setShowAppointSecretary,
    removalDialogs,
    officersQuery,
    showManagersQuery,
    upcomingShowsQuery,
    members,
    activeMemberCount,
    officers,
    showManagers,
    showManagerIds,
    sortedOfficers,
    memberViews,
    filteredMembers,
    hasActiveMemberFilters,
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
  } = useClubMembersManager(clubId);

  // Loading state
  if (rosterLoading) {
    return (
      <div role="status" aria-label="Loading club members" className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-muted" />
          <div className="h-10 w-32 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
        <TableSkeleton rows={5} columns={4} />
      </div>
    );
  }

  // Error state — distinguish a failed load from a genuinely empty roster, so an
  // admin never mistakes "couldn't load" for "no members yet".
  if (rosterError) {
    return (
      <div className="flex items-center justify-center py-12">
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
    );
  }

  return (
    <>
      <div className="space-y-6" aria-label={`${clubName} members`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
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
          <Button onClick={() => setShowAddMember(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Member
          </Button>
        </div>

        <Card className="border border-border rounded-2xl shadow-sm ">
          <CardContent className="p-6">
            <PrimaryTabs
              tabs={clubMembersTabs}
              value={selectedTab}
              onValueChange={setSelectedTab}
              ariaLabel="Member management"
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
                <ClubShowAccessRequests {...membershipRequests.listProps} />

                {/* Views, search and result line — the list toolkit
                    (docs/plan-list-toolkit.md, MYK9-797). No bulk bar: no
                    bulk action was drafted for club members. */}
                <ListViewTabs
                  label="Member views"
                  views={memberViews}
                  activeId={memberStatus}
                  onSelect={id => setMemberStatus(id as MemberStatusFilter)}
                />
                <ListFilterBar
                  searchValue={searchQuery}
                  onSearchChange={setSearchQuery}
                  searchPlaceholder="Search members by name or email..."
                  fields={[]}
                />
                <ListResultLine
                  shown={filteredMembers.length}
                  total={members.length}
                  noun={MEMBER_NOUN}
                  filtered={hasActiveMemberFilters}
                  // One URL update: two setters would each clone the same snapshot.
                  onShowAll={() => patchSearchParams(setSearchParams, { status: null, q: null })}
                />

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

              {/* Show Access Tab */}
              <TabsContent value="show-access" className="mt-6 space-y-4">
                <ClubShowAccessTab
                  managers={showManagers}
                  unavailable={showAccessUnavailable}
                  onRetry={() => void showManagersQuery.refetch()}
                  onAppoint={() => setShowAppointSecretary(true)}
                  onRevoke={(personId, personName) =>
                    handleToggleShowAccess(personId, false, personName)
                  }
                  upcomingShowCount={upcomingShowsQuery.data ?? 0}
                  {...roleRequestsTabProps}
                />
              </TabsContent>
            </PrimaryTabs>
          </CardContent>
        </Card>
      </div>

      <ClubRemovalDialogs {...removalDialogs} />

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

      <AppointSecretaryDialog
        open={showAppointSecretary}
        onClose={() => setShowAppointSecretary(false)}
        onAppoint={handleAppointSecretary}
        people={people}
        appointedIds={showManagerIds}
        isSaving={toggleShowAccessMutation.isPending}
      />

      <AssignOfficerDialog
        open={showAssignOfficer}
        onClose={() => setShowAssignOfficer(false)}
        onSave={(personId, position) => addOfficerMutation.mutate({ personId, position })}
        members={members}
        people={people}
        isSaving={addOfficerMutation.isPending}
      />
    </>
  );
};

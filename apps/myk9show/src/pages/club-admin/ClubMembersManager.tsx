/**
 * Club members manager: the club admin's roster, officers and show-access tools, rendered as the
 * Members tab of the club page for the admin of THAT club (MYK9-1293, one concern one page).
 * Everyone else keeps the read-only MembersTab.
 */

import React, { useState } from 'react';
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
  LIST_LINK_BUTTON,
} from '@/components/list-toolkit';
import { Plus, Shield, AlertTriangle } from 'lucide-react';
import { AddMemberDialog, AssignOfficerDialog } from './ClubMemberDialogs';
import { ClubShowAccessRequests } from './ClubShowAccessRequests';
import { MembersTable, OfficersTable } from './ClubMemberTables';
import { ClubAdminsTab } from './ClubAdminsTab';
import { ClubAdminDialogs } from './ClubAdminDialogs';
import { useClubPeopleList } from './useClubPeopleList';
import type { RoleActions } from './MemberActionMenu';
import { ClubShowAccessTab, AppointSecretaryDialog } from './ClubShowAccessTab';
import { ClubRemovalDialogs } from './ClubRemovalDialogs';
import { ClubCommitteeSection } from '@/components/committee/ClubCommitteeSection';
import { useClubMembersManager } from './useClubMembersManager';

const MEMBER_NOUN = ['person', 'people'] as const;

const ROLE_EXPLAINER =
  "Admins manage the club: members, payments and branding. Show secretaries create and run the club's shows. Officer titles print in your premium list and change nothing else.";

const NOTICE_CLASS =
  'rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning';

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

  // MYK9-2364: one merged list. A source that failed to load is passed as null so its badges read
  // as unknown, never as absent.
  const list = useClubPeopleList({
    clubId,
    members,
    officers: officersUnavailable ? null : officers,
    showManagers: showAccessUnavailable ? null : showManagers,
    searchQuery,
  });
  const [titleFor, setTitleFor] = useState<{ personId: string; name: string } | null>(null);
  const roleActions: RoleActions = {
    onMakeAdmin: list.makeAdmin,
    onRemoveAdmin: list.removeAdmin,
    onSetOfficerTitle: row => {
      if (row.personId) setTitleFor({ personId: row.personId, name: row.name });
    },
    onRemoveOfficer: handleRemoveOfficer,
  };

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
                <p className="text-sm text-muted-foreground">{ROLE_EXPLAINER}</p>
                {showAccessUnavailable && (
                  <p role="status" className={NOTICE_CLASS}>
                    We couldn&apos;t load show secretaries just now, so who holds that role is
                    unknown here. Everything else on this list is current.
                  </p>
                )}
                {officersUnavailable && (
                  <p role="status" className={NOTICE_CLASS}>
                    We couldn&apos;t load officer titles just now, so who holds them is unknown
                    here.
                  </p>
                )}
                {list.adminsUnavailable && (
                  <p role="status" className={NOTICE_CLASS}>
                    {list.adminsOffline
                      ? 'You are offline, so who is an admin is unknown here. Reconnect to see it.'
                      : "We couldn't load the admins list, so who is an admin is unknown here."}
                    {!list.adminsOffline && (
                      <>
                        {' '}
                        <button
                          type="button"
                          onClick={list.retryAdmins}
                          className="underline underline-offset-2"
                        >
                          Try again
                        </button>
                      </>
                    )}
                  </p>
                )}
                <ClubShowAccessRequests {...membershipRequests.listProps} />

                {/* Views, search and result line — the list toolkit
                    (docs/plan-list-toolkit.md, MYK9-797). No bulk bar: no
                    bulk action was drafted for club members. */}
                <ListViewTabs
                  label="Member views"
                  views={list.views}
                  activeId={list.view}
                  onSelect={list.selectView}
                />
                <ListFilterBar
                  searchValue={searchQuery}
                  onSearchChange={setSearchQuery}
                  searchPlaceholder="Search people by name or email..."
                  fields={[list.statusField]}
                />
                {list.complete ? (
                  <ListResultLine
                    shown={list.filteredRows.length}
                    total={list.rows.length}
                    noun={MEMBER_NOUN}
                    filtered={list.hasActiveFilters}
                    // The empty table offers its own Show all button: one button, one place.
                    showAllInEmptyState={list.filteredRows.length === 0}
                    // One URL update: separate setters would each clone the same snapshot.
                    onShowAll={list.showAll}
                  />
                ) : (
                  // Some role lists are missing, so people found only there are missing too: say
                  // what is shown, never "all N".
                  <p role="status" className="text-sm text-muted-foreground">
                    Showing {list.filteredRows.length}{' '}
                    {list.filteredRows.length === 1 ? 'person' : 'people'} found so far. The list is
                    not complete yet.
                    {list.hasActiveFilters && list.filteredRows.length > 0 && (
                      <button type="button" onClick={list.showAll} className={LIST_LINK_BUTTON}>
                        Show all people
                      </button>
                    )}
                  </p>
                )}

                {/* Members Table */}
                <MembersTable
                  rows={list.filteredRows}
                  roleActions={roleActions}
                  searchQuery={searchQuery}
                  filtered={list.hasActiveFilters}
                  incomplete={!list.complete}
                  onShowAll={list.showAll}
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
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Printed in your premium list. Doesn&apos;t change what anyone can do in
                    myK9Show.
                  </p>
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

                {/* MYK9-2064: the Event Committee the premium prints, below the Officers. */}
                <ClubCommitteeSection clubId={clubId} people={people} />
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

              {/* Admins Tab (MYK9-2209) */}
              <TabsContent value="admins" className="mt-6 space-y-4">
                <ClubAdminsTab clubId={clubId} clubName={clubName} />
              </TabsContent>
            </PrimaryTabs>
          </CardContent>
        </Card>
      </div>

      <ClubRemovalDialogs {...removalDialogs} />

      <ClubAdminDialogs clubName={clubName} {...list.adminDialogProps} />

      <AssignOfficerDialog
        // A new key per person (and on close) starts the dialog fresh without an effect.
        key={titleFor?.personId ?? 'closed'}
        open={titleFor !== null}
        onClose={() => setTitleFor(null)}
        onSave={(target, position) =>
          addOfficerMutation.mutate({ ...target, position }, { onSuccess: () => setTitleFor(null) })
        }
        members={members}
        people={people}
        isSaving={addOfficerMutation.isPending}
        fixedPerson={titleFor}
      />

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
        onSave={(target, position) => addOfficerMutation.mutate({ ...target, position })}
        members={members}
        people={people}
        isSaving={addOfficerMutation.isPending}
      />
    </>
  );
};

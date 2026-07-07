import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useUrlTab } from '@/hooks/useUrlTab';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import WaitlistManagementPage from './WaitlistManagementPage/index';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { auditService } from '@/services/AuditService';
import { UserRole } from '@/types/auth-types';
import { AuditAction } from '@/types/audit-types';
import { Users, AlertCircle, Download } from 'lucide-react';
import { SecretaryAddEntriesDecision } from '@/features/registration/SecretaryAddEntriesDecision';
import { TableSkeleton } from '@/components/common/SkeletonLoaders';

import { useEntryManagementData } from '@/hooks/useEntryManagementData';
import { useEntryManagementFilters } from '@/hooks/useEntryManagementFilters';
import { useEntryManagementActions } from '@/hooks/useEntryManagementActions';
import {
  useEntryManagementTrialClasses,
  useEntryManagementTrialScope,
} from '@/hooks/useEntryManagementTrialScope';
import {
  ArmbandDialog,
  CompEntryDialog,
  FilterBreadcrumb,
  TrialClassFilters,
  TrialRosterView,
  TrialScopeBar,
  RegistrationView,
} from '@/components/entries/management';
import { EntryEditDialog } from '@/components/entries/EntryEditDialog';
import { MoveUpRequestsTab } from '@/components/entries/MoveUpRequestsTab';
import { PullManagementTab } from '@/components/entries/PullManagementTab';
import { groupEntriesByEnrollment, type EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { EntryManagementEntry } from '@/types/entry-management-types';

const PAGE_TABS: PrimaryTabDef[] = [
  { id: 'entries', label: 'Entries' },
  { id: 'move-ups', label: 'Move-ups' },
  { id: 'pulls', label: 'Pulls' },
  { id: 'waitlist', label: 'Waitlist' },
];

/**
 * Entry Management Page for show secretaries
 * Refactored as part of DEBT-002 - extracted hooks, components, and utilities
 * Original: 1,428 lines -> Refactored: ~400 lines (72% reduction)
 */
const EntryManagementPage: React.FC = () => {
  const params = useParams<{ showId?: string; id?: string }>();
  const urlShowId = params.showId ?? params.id;
  const [activePageTab] = useUrlTab(
    ['entries', 'move-ups', 'pulls', 'waitlist'] as const,
    'entries'
  );
  const [searchParams, setSearchParams] = useSearchParams();
  // Read the trial param directly so the trial's class list can be fetched
  // before useEntryManagementFilters (which consumes the class ids to filter the
  // entry list in place).
  const trialParam = searchParams.get('trial');

  useEffect(() => {
    if (searchParams.get('tab') !== 'exceptions') return;
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.set('tab', prev.get('queue') === 'pulled' ? 'pulls' : 'move-ups');
        next.delete('queue');
        return next;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams]);

  // Leaving Entries resets the entry drill-down (trial/class/roster) so a later
  // return doesn't re-enter scoring/roster unexpectedly.
  const handlePageTabChange = (tab: string) => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (tab === 'entries') {
          next.delete('tab');
          next.delete('queue');
        } else {
          next.set('tab', tab);
          next.delete('trial');
          next.delete('class');
          next.delete('roster');
          next.delete('queue');
        }
        return next;
      },
      { replace: true }
    );
  };

  const {
    user,
    hasRole,
    shows,
    selectedShowId,
    isLoadingShows,
    entries,
    setEntries,
    isLoading,
    error,
    setError,
    loadError,
    loadEntries,
    stats,
    tabCounts,
    lastEmailedMap,
    refreshEmailLog,
  } = useEntryManagementData(urlShowId);

  // Classes for the selected trial — fetched before useEntryManagementFilters so
  // their ids can scope the (show-wide) entry list to the chosen trial.
  const { trialClasses, trialClassIds, isLoadingClasses } =
    useEntryManagementTrialClasses(trialParam);

  const {
    searchTerm,
    setSearchTerm,
    paymentFilter,
    setPaymentFilter,
    attentionFilter,
    setAttentionFilter,
    workMode,
    setWorkMode,
    entryViewMode,
    setEntryViewMode,
    trialFilter,
    classFilter,
    viewMode,
    rosterView,
    setRosterView,
    setTrialFilter,
    setClassFilter,
    filteredEntries,
  } = useEntryManagementFilters({ entries, tabCounts, showId: selectedShowId, trialClassIds });

  const enrollmentGroups: EnrollmentGroup[] = useMemo(
    () => groupEntriesByEnrollment(filteredEntries),
    [filteredEntries]
  );
  const selectedShow = shows.find(s => s.id === selectedShowId) ?? null;

  const {
    isProcessing,
    armbandDialog,
    setArmbandDialog,
    handleStatusChange,
    handleAssignArmband,
    handleNextArmband,
    handleEnrollmentBulkStatusChange,
    handleEnrollmentBulkCheckIn,
    handleEnrollmentPaymentChange,
    handleCheckInStatusChange,
    handleExportCSV,
    handleCompEntry,
    handleUncompEntry,
    handleRemoveEntry,
    handleSendDecisionEmail,
  } = useEntryManagementActions({
    entries,
    setEntries,
    selectedShowId,
    selectedShow,
    loadEntries,
    setError,
    user,
  });

  const {
    trials,
    isLoadingTrials,
    breadcrumbTrialName,
    breadcrumbClassName,
    rosterEntries,
    isLoadingTrialEntries,
  } = useEntryManagementTrialScope({
    selectedShowId,
    trialFilter,
    classFilter,
    trialClasses,
  });

  const [compDialog, setCompDialog] = useState<{
    open: boolean;
    entryId: string;
    entryNumber: string;
    dogName: string;
    className: string;
  }>({
    open: false,
    entryId: '',
    entryNumber: '',
    dogName: '',
    className: '',
  });
  const [editEntry, setEditEntry] = useState<
    React.ComponentProps<typeof EntryEditDialog>['entry'] | null
  >(null);

  const openEditEntry = (entry: EntryManagementEntry) => {
    setEditEntry({
      id: entry.id,
      showId: entry.showId,
      showName: selectedShow?.name ?? 'this show',
      dogName: entry.dogName,
      handler: entry.handlerName,
      classes: entry.classes.map(cls => ({
        id: cls.id,
        name: cls.name,
        number: cls.number,
        fee: cls.fee,
        status: cls.status,
        handler: entry.handlerName,
        handlerId: cls.handlerId ?? entry.handlerId ?? null,
        ...(cls.trialType !== undefined ? { trialType: cls.trialType } : {}),
        ...(cls.jumpHeight !== undefined ? { jumpHeight: cls.jumpHeight } : {}),
      })),
    });
  };

  useEffect(() => {
    auditService.log({
      action: AuditAction.READ,
      entityType: 'entry_management',
      entityId: user?.id || 'unknown',
      metadata: {
        page: 'entry_management',
        loadTime: new Date().toISOString(),
      },
    });
  }, [user?.id]);

  if (
    !hasRole(UserRole.SECRETARY) &&
    !hasRole(UserRole.CLUB_ADMIN) &&
    !hasRole(UserRole.SITE_ADMIN)
  ) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-warning mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground">
              This page is only accessible to users with secretary permissions.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
            Entry Management
          </h1>
          <p className="text-muted-foreground">
            Manage show entries, process payments, and communicate with exhibitors
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap md:w-auto md:justify-end">
          <SecretaryAddEntriesDecision showId={selectedShowId} />
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={!selectedShowId || isProcessing}
            className="w-full sm:w-auto"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Full CSV
          </Button>
        </div>
      </div>

      {/*
        Action Error Alert

        Surfaces failures from `useEntryManagementActions` (export
        CSV, bulk status, comp/uncomp, remove-entry, armband
        assignment, etc.). Stays at the top of the page so the
        entries table below remains usable — these errors are
        action-scoped, not data-scoped, and the user's recovery is to
        retry the action, not reload entries. Load failures use the
        in-tab error card instead (see `loadError` below).
      */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Page-level tabs: Entries | Move-ups | Pulls | Waitlist */}
      <PrimaryTabs tabs={PAGE_TABS} value={activePageTab} onValueChange={handlePageTabChange}>
        <TabsContent value="entries">
          {/* No Show Selected — kept as loading guard while useEntryManagementData resolves the show */}
          {!selectedShowId && isLoadingShows && (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-medium mb-2">Loading...</h3>
              </CardContent>
            </Card>
          )}

          {/*
            Loading State — a table-shaped skeleton (not a bare spinner) so the
            pending UI previews the entries table's layout. Motion-language
            policy: page/section loads use Skeleton; animate-spin is reserved for
            inline button/pending states. Error + empty states below stay
            distinct (never a skeleton that shimmers forever).
          */}
          {isLoading && selectedShowId && (
            <div role="status" aria-label="Loading entries" className="py-4">
              <TableSkeleton rows={8} columns={5} />
            </div>
          )}

          {/*
            Load Error State

            Replaces the misleading zero-entry main content when
            `loadEntries` failed. Per the 2026-05-26 secretary
            launch-readiness audit, the previous behavior was a thin
            destructive Alert above an "0 entries" view, which read as
            "no entries to review" rather than "couldn't load
            entries." A Card-shaped error with an explicit Retry
            button replaces the misleading empty state entirely.

            Crucially this gates on `loadError`, NOT `error` — `error`
            also carries action failures (export, bulk status, etc.)
            from `useEntryManagementActions`, which must NOT hide a
            successfully-loaded entries table. See the action-error
            Alert at the top of the page for that surface.
          */}
          {loadError && selectedShowId && !isLoading && (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Couldn't load entries</h3>
                <Alert variant="destructive" className="text-left mb-4 max-w-md mx-auto">
                  <AlertDescription>{loadError}</AlertDescription>
                </Alert>
                <Button onClick={() => loadEntries(selectedShowId)} disabled={isLoading}>
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {/*
            Main Content — only when a show is selected, loading
            finished, AND no LOAD error. The `!loadError` gate keeps
            the page usable when an action error fires (which
            populates `error` separately) — action errors show as an
            inline Alert at the top while the entries table remains
            interactive.
          */}
          {selectedShowId && !isLoading && !loadError && (
            <div className="space-y-6 mt-6">
              {/* Trial / Class Filters */}
              <TrialClassFilters
                trials={trials}
                classes={trialClasses}
                trialFilter={trialFilter}
                classFilter={classFilter}
                onTrialChange={setTrialFilter}
                onClassChange={setClassFilter}
                isLoadingTrials={isLoadingTrials}
                isLoadingClasses={isLoadingClasses}
              />

              {/* Filter Breadcrumb */}
              <FilterBreadcrumb
                trialName={breadcrumbTrialName}
                className={breadcrumbClassName}
                onClearTrial={() => setTrialFilter(null)}
                onClearClass={() => setClassFilter(null)}
              />

              {/* Trial scope controls (List/Roster toggle + "Score this class"
                  deep-link) — only once a trial is selected. */}
              {trialFilter && (
                <TrialScopeBar
                  rosterView={rosterView}
                  onRosterViewChange={setRosterView}
                  classId={classFilter}
                />
              )}

              {/* Registration view: stats, filters, bulk actions, and entries */}
              {viewMode === 'registration' && (
                <RegistrationView
                  stats={stats}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  paymentFilter={paymentFilter}
                  setPaymentFilter={setPaymentFilter}
                  attentionFilter={attentionFilter}
                  setAttentionFilter={setAttentionFilter}
                  workMode={workMode}
                  setWorkMode={setWorkMode}
                  entryViewMode={entryViewMode}
                  setEntryViewMode={setEntryViewMode}
                  filteredEntries={filteredEntries}
                  showId={selectedShowId}
                  entries={entries}
                  onBulkStatusChange={handleEnrollmentBulkStatusChange}
                  onBulkCheckIn={handleEnrollmentBulkCheckIn}
                  onPaymentStatusChange={handleEnrollmentPaymentChange}
                  onStatusChange={handleStatusChange}
                  onCheckInStatusChange={handleCheckInStatusChange}
                  onOpenEditEntry={openEditEntry}
                  onOpenArmbandDialog={entry =>
                    setArmbandDialog({
                      open: true,
                      entry,
                      value: entry.armbandNumber || '',
                    })
                  }
                  onOpenCompDialog={entry =>
                    setCompDialog({
                      open: true,
                      entryId: entry.id,
                      entryNumber: entry.entryNumber,
                      dogName: entry.dogName,
                      className: entry.classes[0]?.name ?? '',
                    })
                  }
                  onUncompEntry={handleUncompEntry}
                  onRemoveEntry={handleRemoveEntry}
                  onRefresh={() => loadEntries(selectedShowId)}
                  enrollmentGroups={enrollmentGroups}
                  lastEmailedMap={lastEmailedMap}
                  onSendDecisionEmail={async (registrationId, message, amountDue) => {
                    await handleSendDecisionEmail(registrationId, message, amountDue);
                    const regIds = [...new Set(entries.map(e => e.registrationId).filter(Boolean))];
                    refreshEmailLog(regIds);
                  }}
                />
              )}

              {/* Roster view: trial entries (explicit toggle, class-filtered). */}
              {viewMode === 'roster' && (
                <TrialRosterView
                  entries={rosterEntries}
                  onClassClick={classId => setClassFilter(classId)}
                  isLoading={isLoadingTrialEntries}
                />
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="move-ups">
          {selectedShowId && (
            <Card>
              <CardContent className="pt-6">
                <MoveUpRequestsTab
                  showId={selectedShowId}
                  onRefresh={() => loadEntries(selectedShowId)}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pulls">
          {selectedShowId && (
            <Card>
              <CardContent className="pt-6">
                <PullManagementTab
                  showId={selectedShowId}
                  onRefresh={() => loadEntries(selectedShowId)}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="waitlist">
          <WaitlistManagementPage showId={selectedShowId || undefined} />
        </TabsContent>
      </PrimaryTabs>

      {/* Armband Assignment Dialog */}
      <ArmbandDialog
        dialogState={armbandDialog}
        setDialogState={setArmbandDialog}
        onAssign={handleAssignArmband}
        onNextArmband={handleNextArmband}
        isProcessing={isProcessing}
      />

      {/* Comp Entry Dialog */}
      <CompEntryDialog
        open={compDialog.open}
        onOpenChange={open => {
          if (!open)
            setCompDialog({
              open: false,
              entryId: '',
              entryNumber: '',
              dogName: '',
              className: '',
            });
        }}
        entryNumber={compDialog.entryNumber}
        dogName={compDialog.dogName}
        className={compDialog.className}
        onConfirm={reason => {
          handleCompEntry(compDialog.entryId, reason);
          setCompDialog({ open: false, entryId: '', entryNumber: '', dogName: '', className: '' });
        }}
        isProcessing={isProcessing}
      />
      {editEntry && (
        <EntryEditDialog
          open={true}
          onOpenChange={open => {
            if (!open) setEditEntry(null);
          }}
          entry={editEntry}
          onUpdate={() => loadEntries(selectedShowId)}
        />
      )}
    </div>
  );
};

export default EntryManagementPage;

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
import {
  Users,
  AlertCircle,
  Download,
  Loader2,
  Plus,
} from 'lucide-react';

import { useEntryManagementData } from '@/hooks/useEntryManagementData';
import { useEntryManagementFilters } from '@/hooks/useEntryManagementFilters';
import { useEntryManagementActions } from '@/hooks/useEntryManagementActions';
import { useShowTrials } from '@/hooks/queries/useShowTrials';
import { useClassesByTrialQuery } from '@/hooks/queries/useClassesDatabase';
import { useTrialEntries } from '@/hooks/queries/useTrialEntries';
import {
  ArmbandDialog,
  CompEntryDialog,
  FilterBreadcrumb,
  TrialClassFilters,
  TrialRosterView,
  ScoringModeWrapper,
  RegistrationView,
} from '@/components/entries/management';
import { groupEntriesByEnrollment, type EnrollmentGroup } from '@/utils/enrollmentGrouping';

const PAGE_TABS: PrimaryTabDef[] = [
  { id: 'entries', label: 'Entries' },
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
  const navigate = useNavigate();
  const [activePageTab] = useUrlTab(['entries', 'waitlist'] as const, 'entries');
  const [, setSearchParams] = useSearchParams();

  // Combined tab + filter reset: switching to waitlist clears trial/class params
  // so returning to entries doesn't unexpectedly re-enter scoring mode.
  const handlePageTabChange = (tab: string) => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (tab === 'entries') {
          next.delete('tab');
        } else {
          next.set('tab', tab);
          next.delete('trial');
          next.delete('class');
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

  const {
    searchTerm,
    setSearchTerm,
    paymentFilter,
    setPaymentFilter,
    selectedTab,
    setSelectedTab,
    trialFilter,
    classFilter,
    viewMode,
    setTrialFilter,
    setClassFilter,
    filteredEntries,
  } = useEntryManagementFilters({ entries, tabCounts, showId: selectedShowId });

  const enrollmentGroups: EnrollmentGroup[] = useMemo(
    () => groupEntriesByEnrollment(filteredEntries),
    [filteredEntries]
  );

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
    selectedShow: shows.find(s => s.id === selectedShowId) ?? null,
    loadEntries,
    setError,
    user,
  });

  const { data: rawTrials = [], isLoading: isLoadingTrials } = useShowTrials(selectedShowId);
  const trials = rawTrials as Array<{
    id: string;
    name: string | null;
    date: string | null;
    trial_number: string | number | null;
  }>;
  const { data: rawTrialClasses = [], isLoading: isLoadingClasses } = useClassesByTrialQuery(
    trialFilter || '',
    !!trialFilter
  );
  const trialClasses = rawTrialClasses as Array<{ id: string; name: string | null }>;
  const { data: trialEntryRows = [], isLoading: isLoadingTrialEntries } = useTrialEntries(
    trialFilter || ''
  );

  const rosterEntries = useMemo(() => {
    if (!trialEntryRows.length) return [];
    return trialEntryRows.map(row => ({
      id: row.id,
      armband: row.armband,
      dogName: row.dog?.call_name || row.dog?.name || 'Unknown Dog',
      breed: row.dog?.breed || null,
      handlerName:
        row.handler ||
        (row.dog?.owner
          ? `${row.dog.owner.first_name || ''} ${row.dog.owner.last_name || ''}`.trim()
          : 'Unknown'),
      className: row.class?.name || 'Unknown Class',
      classId: row.class_id,
      isScored: row.is_scored === true,
      checkInStatus: row.check_in_status || null,
    }));
  }, [trialEntryRows]);

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
            <AlertCircle className="h-12 w-12 text-amber-600 dark:text-amber-500 mx-auto mb-4" />
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
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Entry Management</h1>
          <p className="text-muted-foreground">
            Manage show entries, process payments, and communicate with exhibitors
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => navigate(`/secretary/register/${selectedShowId}`)}
            disabled={!selectedShowId}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Entry
          </Button>
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={!selectedShowId || isProcessing}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
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

      {/* Page-level tabs: Entries | Waitlist */}
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

          {/* Loading State */}
          {isLoading && selectedShowId && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
                <Button
                  onClick={() => loadEntries(selectedShowId)}
                  disabled={isLoading}
                >
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
                trialName={
                  trialFilter
                    ? (() => {
                        const t = trials.find(tr => tr.id === trialFilter);
                        return t ? t.name || `Trial ${t.trial_number}` : null;
                      })()
                    : null
                }
                className={
                  classFilter
                    ? (() => {
                        const c = trialClasses.find(cl => cl.id === classFilter);
                        return c?.name || null;
                      })()
                    : null
                }
                onClearTrial={() => setTrialFilter(null)}
                onClearClass={() => setClassFilter(null)}
              />

              {/* Registration view: stats, filters, bulk actions, entries tabs */}
              {viewMode === 'registration' && (
                <RegistrationView
                  stats={stats}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  paymentFilter={paymentFilter}
                  setPaymentFilter={setPaymentFilter}
                  selectedTab={selectedTab}
                  setSelectedTab={setSelectedTab}
                  tabCounts={tabCounts}
                  filteredEntries={filteredEntries}
                  entries={entries}
                  onBulkStatusChange={handleEnrollmentBulkStatusChange}
                  onBulkCheckIn={handleEnrollmentBulkCheckIn}
                  onPaymentStatusChange={handleEnrollmentPaymentChange}
                  onStatusChange={handleStatusChange}
                  onCheckInStatusChange={handleCheckInStatusChange}
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
                  showId={selectedShowId}
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

              {/* Roster view: trial entries grouped by class */}
              {viewMode === 'roster' && (
                <TrialRosterView
                  entries={rosterEntries}
                  onClassClick={classId => setClassFilter(classId)}
                  isLoading={isLoadingTrialEntries}
                />
              )}

              {viewMode === 'scoring' && classFilter && (
                <ScoringModeWrapper
                  classId={classFilter}
                  showId={selectedShowId}
                  trialId={trialFilter || ''}
                  onBack={() => setClassFilter(null)}
                />
              )}

            </div>
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
          if (!open) setCompDialog({ open: false, entryId: '', entryNumber: '', dogName: '', className: '' });
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
    </div>
  );
};

export default EntryManagementPage;

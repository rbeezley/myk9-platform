import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { auditService } from '@/services/AuditService';
import { useShowManageScope } from '@/hooks/useShowManageScope';
import { trialSecretaryOnlyReason } from '@/features/actions/trialSecretaryAccess';
import { TrialSecretaryAccessProvider } from '@/features/actions/TrialSecretaryAccessContext';
import { AuditAction } from '@/types/audit-types';
import { AlertCircle } from 'lucide-react';
import { TableSkeleton } from '@/components/common/SkeletonLoaders';

import { useEntryManagementData } from '@/hooks/useEntryManagementData';
import { useEntryManagementActions } from '@/hooks/useEntryManagementActions';
import {
  useEntryManagementTrialClasses,
  useEntryManagementTrialScope,
} from '@/hooks/useEntryManagementTrialScope';
import { useEntryManagementCockpit } from '@/hooks/useEntryManagementCockpit';
import { useMoveUpRequestsCount } from '@/hooks/useMoveUpRequestsCount';
import { useEntryManagementHeaderActions } from '@/hooks/useEntryManagementHeaderActions';
import { getEntryWindowTimezone } from '@/utils/entryWindowDate';
import { useEnrollmentLedgerActions } from '@/hooks/useEnrollmentLedgerActions';
import { ArmbandDialog, CompEntryDialog } from '@/components/entries/management';
import { EntryManagementCockpit } from '@/components/entries/management/EntryManagementCockpit';
import { EntryManagementViewToolbar } from '@/components/entries/management/EntryManagementViewToolbar';
import { EntryListViewHeader } from '@/components/entries/management/EntryListViewHeader';
import { EntryEditDialog } from '@/components/entries/EntryEditDialog';
import { classifyEntryRemoval, isExhibitorRemoval } from '@/features/payments/pullReconciliation';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  getCockpitNormalizationContext,
  normalizeEntryManagementCockpitParams,
  writeCockpitFocus,
  writeCockpitScope,
  writeCockpitSearch,
  writeCockpitView,
} from '@/components/entries/management/entryManagementCockpitParams';
import { parseListParam } from '@/components/list-toolkit';
import { groupEntriesByShowRegistration } from '@/components/entries/management/showRegistrationProjection';
import { ShowDeskReturnLink } from '@/features/show-map/cockpit/ShowDeskReturnLink';
import { EntryManagementUnresolvedShow } from './EntryManagementUnresolvedShow';
import { EntryManagementExceptionPanes } from './EntryManagementExceptionPanes';
import { useRegistrationNeededEntries } from '@/hooks/useRegistrationNeededEntries';
import { registerCommandMenuContext } from '@/features/command-menu/commandMenuContextStore';

const EntryManagementPage: React.FC = () => {
  const params = useParams<{ showId?: string; id?: string }>();
  const urlShowId = params.showId ?? params.id;
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    user,
    shows,
    selectedShowId,
    isLoadingShows,
    didResolveShow,
    showError,
    retryShowResolution,
    entries,
    setEntries,
    isLoading,
    loadedEntriesShowId,
    error,
    setError,
    loadError,
    loadEntries,
    lastEmailedMap,
    refreshEmailLog,
  } = useEntryManagementData(urlShowId);
  // Same two gates the Show Day tab uses: `canManage` decides the page,
  // `canOperate` decides the handful of controls that route into
  // `ProtectedRoute(SECRETARY | SITE_ADMIN)`. "Add Entry" is one of
  // them, so a club admin gets it greyed with a reason rather than a click that
  // dead-ends on a permission wall.
  const manageScope = useShowManageScope(urlShowId);
  // `showIdKnown: false` when the URL names no show. This page is reachable both
  // as `/shows/:id/entries` (the six-tab surface) and as a bare
  // `/secretary/entries` that resolves its show from localStorage — and on the
  // second there is nothing for `useShowManageScope` to scope against, so it
  // never leaves `resolving`. Failing closed there disabled "Add Entry"
  // permanently for a real trial secretary (REV-2341 R-2).
  const secretaryOnlyReason = trialSecretaryOnlyReason(manageScope, {
    showIdKnown: Boolean(urlShowId),
  });
  const registrationGroups = useMemo(() => groupEntriesByShowRegistration(entries), [entries]);
  // MYK9-632: the tab lists BOTH acts an exhibitor can leave behind. A pull
  // ('scratched') is the club's call; a withdrawal carrying one of the two
  // recognised reason codes is the premium's, and the secretary confirms it on
  // the same surface. A 'withdrawn' row with NO code is a secretary removal, not
  // an exhibitor act, and stays out.
  const pulledEntries = useMemo(
    () =>
      entries.filter(entry =>
        isExhibitorRemoval(
          classifyEntryRemoval({
            entryStatus: entry.rawEntryStatus,
            withdrawalReasonCode: entry.withdrawalReasonCode,
          })
        )
      ),
    [entries]
  );
  const canValidateFocus =
    Boolean(selectedShowId) && loadedEntriesShowId === selectedShowId && !isLoading && !loadError;
  const { trials, trialsLoaded } = useEntryManagementTrialScope({ selectedShowId });
  const showTrialIds = useMemo(() => trials.map(trial => trial.id), [trials]);
  // Read from the raw param: the normalizer below needs these classes to know which ids are stale.
  const trialKey = searchParams.get('trial') ?? '';
  const selectedTrialIds = useMemo(() => parseListParam(trialKey), [trialKey]);
  const trialClassScope = useEntryManagementTrialClasses({
    showTrialIds,
    trialsLoaded,
    selectedTrialIds,
  });
  const { trialClassIds, isLoadingClasses, trialClassesUnknown, refetchTrialClasses } =
    trialClassScope;
  const normalizationContext = useMemo(
    () => ({
      ...(canValidateFocus ? getCockpitNormalizationContext(registrationGroups) : {}),
      // Stale ids are dropped only once the list they belong to has loaded (settled rule 9).
      ...(trialsLoaded ? { knownTrialIds: new Set(showTrialIds) } : {}),
      ...(trialClassScope.knownClassIds ? { knownClassIds: trialClassScope.knownClassIds } : {}),
      ...(trialClassIds ? { selectedTrialClassIds: new Set(trialClassIds) } : {}),
    }),
    [
      canValidateFocus,
      registrationGroups,
      showTrialIds,
      trialClassIds,
      trialClassScope.knownClassIds,
      trialsLoaded,
    ]
  );
  const cockpitUrl = useMemo(
    () => normalizeEntryManagementCockpitParams(searchParams, normalizationContext),
    [normalizationContext, searchParams]
  );
  const { trialIds } = cockpitUrl.state;
  // The command menu's trial commands need one trial; with several picked there is none to name.
  const trialParam = trialIds.length === 1 ? trialIds[0] : null;

  useEffect(() => {
    if (!selectedShowId) return;
    return registerCommandMenuContext({
      surface: 'entry-management',
      showId: selectedShowId,
      ...(trialParam ? { trialId: trialParam } : {}),
    });
  }, [selectedShowId, trialParam]);

  useEffect(() => {
    const focusNeedsValidation = searchParams.has('registration') || searchParams.has('entry');
    if (focusNeedsValidation && !canValidateFocus) return;
    if (cockpitUrl.params.toString() !== searchParams.toString()) {
      setSearchParams(cockpitUrl.params, { replace: true });
    }
  }, [canValidateFocus, cockpitUrl.params, searchParams, setSearchParams]);

  const selectedShow = shows.find(s => s.id === selectedShowId) ?? null;
  const showTimeZone = useMemo(() => getEntryWindowTimezone(trials), [trials]);
  const paymentLedger = useEnrollmentLedgerActions({ setEntries, showTimeZone });

  // One shared cockpit for the page's Filter menu (Status, Trial, Class) AND the
  // registration list itself (MYK9-795) — previously computed inside
  // `EntryManagementCockpit`, lifted here so the unified view row (which spans
  // the registration queues AND the Waitlist/Pulls/Move-ups panes) and the
  // filter bar (Trial/Class/Payment status) read the same state the list does.
  const cockpit = useEntryManagementCockpit({
    groups: registrationGroups,
    state: cockpitUrl.state,
    trialClassIds,
    canValidateFocus,
  });
  // A trial is selected but which classes it holds is still being read —
  // scoping to it would render every registration in the show while
  // appearing scoped (see `EntryManagementCockpit`'s trialScopePending doc).
  const trialScopePending = trialIds.length > 0 && isLoadingClasses;
  const { count: moveUpRequestsCount, refetch: refetchMoveUpRequestsCount } =
    useMoveUpRequestsCount(selectedShowId || null);
  // MYK9-1162: derived from the loaded entries, so the count and the pane agree.
  const registrationNeeded = useRegistrationNeededEntries(selectedShowId, entries);
  // Pull / Withdraw on a held entry is the registration's own entry form (one concern,
  // one page): focus it in the All view rather than re-implement those actions here.
  const openEntryForm = (entry: EntryManagementEntry) => {
    const key = getCockpitNormalizationContext(registrationGroups).entryToRegistration?.get(
      entry.id
    );
    setSearchParams(writeCockpitFocus(writeCockpitView(new URLSearchParams(), 'all'), key ?? null));
  };

  const handleClearEntryFilters = () => {
    setSearchParams(
      previous => {
        let next = writeCockpitSearch(previous, '');
        next = writeCockpitScope(next, [], []);
        return writeCockpitView(next, 'all');
      },
      { replace: true }
    );
  };

  const {
    isProcessing,
    armbandDialog,
    setArmbandDialog,
    handleStatusChange,
    handleAssignArmband,
    handleNextArmband,
    handleEnrollmentBulkStatusChange,
    handleCheckInStatusChange,
    handleExportCSV,
    handleCompEntry,
    handleUncompEntry,
    handleEntryRemoved,
    handleSendDecisionEmail,
  } = useEntryManagementActions({
    entries,
    setEntries,
    selectedShowId,
    selectedShow,
    setError,
    user,
  });

  // Count plus newest update: a pull or reject touches updated_at, so capacity is re-read.
  const entriesVersion = useMemo(
    () =>
      `${entries.length}:${entries.reduce((latest, entry) => Math.max(latest, entry.lastUpdated.getTime()), 0)}`,
    [entries]
  );

  useEntryManagementHeaderActions({
    showId: selectedShowId || undefined,
    canManage: manageScope.status === 'resolved' && manageScope.canManage,
    counts: {
      pulls: pulledEntries.length,
      moveUps: moveUpRequestsCount,
      registrationNeeded: registrationNeeded.count,
    },
    secretaryOnlyReason,
    entriesVersion,
    // Full CSV of every entry, as the old toolbar button was; withheld while a status change is
    // in flight (handleExportCSV would silently do nothing). One export per view: the Waitlist
    // list registers its own waitlist CSV, and two rows both reading "Export CSV" could not be
    // told apart.
    exportEnabled:
      Boolean(selectedShowId) &&
      !isProcessing &&
      !(cockpitUrl.state.tab === 'exceptions' && cockpitUrl.state.exception === 'waitlist'),
    onExport: () => void handleExportCSV(),
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
      currentStatus: entry.rawEntryStatus ?? entry.entryStatus,
      createdAt: entry.submittedAt.toISOString(),
      handler: entry.handlerName,
      classes: entry.classes.map(cls => ({
        id: cls.id,
        name: cls.name,
        number: cls.number,
        fee: cls.fee,
        status: cls.status,
        // MYK9-632: the card behind this sheet already renders this reason
        // (`removalSummaryLine`); the sheet must not go back to the wire for a
        // value the page has in hand, nor read differently from the card.
        withdrawalReasonCode: cls.withdrawalReasonCode ?? entry.withdrawalReasonCode,
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

  // THE manage gate, not a second copy of it. This was
  // `!hasRole(SECRETARY) && !hasRole(CLUB_ADMIN) && !hasRole(SITE_ADMIN)` — a
  // GLOBAL, unscoped role list, so it answered "is this person staff anywhere"
  // while `ShowManagementSectionRoute` (the page's only mount) answered "do they
  // manage THIS show". Broader, so it never leaked, but it is exactly the copy
  // that goes stale silently: add a role to one list and the other reads
  // "Access Restricted" (REV-2341 lens P, P4).
  //
  // Only a RESOLVED negative on a KNOWN show denies. Two reasons: while
  // ownership is still settling the body renders and the route holds, so a
  // legitimate manager never sees a denial flash on a cold deep link; and with
  // no show in the URL there is no show to scope against, so the honest answer
  // is "not this gate's question" rather than a confident no.
  if (urlShowId && manageScope.status === 'resolved' && !manageScope.canManage) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-warning mx-auto mb-4" />
            {/* This branch replaces the whole page, so it owns the h1. */}
            <h1 className="mb-2 text-xl font-semibold">Access Restricted</h1>
            <p className="text-muted-foreground">
              This page is only accessible to users with secretary permissions.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="manager-content-container container mx-auto space-y-4 p-4 sm:p-6">
      <ShowDeskReturnLink showId={selectedShowId || urlShowId} />
      <div className="sr-only">
        <h1>Entry Forms</h1>
        {/*
            Name the show. Every accept, reject, refund and exhibitor email on
            this page is scoped to one show, and the secretary can arrive here
            from a bare `/secretary/entries` link that resolves the show from
            localStorage — so without this line they act on a show the page
            never named. The fallback stays generic on purpose: an unresolved
            show must not be described as a named one. The pinned show header
            above names it on screen, so this line is read aloud, not drawn.
          */}
        <p>{selectedShow?.name ?? 'Manage entries, payments, and exhibitor email for one show'}</p>
      </div>

      {/*
        Action Error Alert

        Surfaces failures from `useEntryManagementActions` (export
        CSV, bulk status, comp/uncomp, remove-entry, armband
        assignment, etc.). Stays at the top of the page so the
        entries table below remains usable. These errors are
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

      {/*
        No show to manage. Rendered ABOVE the tabs, not inside one: without a
        show neither tab means anything, and scoping this to Registrations left
        the Exceptions tab showing three filter buttons over empty space -- the
        same blank surface this replaced, one tab across.
      */}
      {!selectedShowId && (
        <EntryManagementUnresolvedShow
          secretaryOnlyReason={secretaryOnlyReason}
          didResolveShow={didResolveShow}
          showError={showError}
          onRetry={retryShowResolution}
          retryDisabled={isLoadingShows}
        />
      )}

      {/* MYK9-1594: Search and Filter are the whole toolbar. The exception lists (Pulls,
          Move-ups, Registration number needed, Waitlist), Export CSV, People at show and Add late
          entry are rows of the header Actions menu (`useEntryManagementHeaderActions`). A list
          swaps this toolbar for its own title and a way back. */}
      {selectedShowId && cockpitUrl.state.tab === 'exceptions' && (
        <EntryListViewHeader exception={cockpitUrl.state.exception} />
      )}
      {selectedShowId && cockpitUrl.state.tab === 'registrations' && (
        <EntryManagementViewToolbar
          cockpit={cockpit}
          trials={trials}
          trialsLoaded={trialsLoaded}
          classes={trialClassScope}
          onClearAll={handleClearEntryFilters}
          result={
            canValidateFocus
              ? { shown: cockpit.page.total, total: cockpit.queueTotals.registrationCount }
              : null
          }
        />
      )}

      {selectedShowId && cockpitUrl.state.tab === 'registrations' && (
        <>
          {/*
            Loading State — a table-shaped skeleton (not a bare spinner) so the
            pending UI previews the entries table's layout. Motion-language
            policy: page/section loads use Skeleton; animate-spin is reserved for
            inline button/pending states. Error + empty states below stay
            distinct (never a skeleton that shimmers forever).
          */}
          {isLoading && (
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
          {loadError && !isLoading && (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <h2 className="mb-2 text-lg font-medium">Couldn't load entries</h2>
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
            Main Content — only when loading finished AND no LOAD error. The
            `!loadError` gate keeps the page usable when an action error fires
            (which populates `error` separately) — action errors show as an
            inline Alert at the top while the entries table remains
            interactive.
          */}
          {!isLoading && !loadError && (
            <div className="mt-6">
              {/* The form's "Add entry for <exhibitor>" greys with the same reason as the header. */}
              <TrialSecretaryAccessProvider reason={secretaryOnlyReason}>
                <EntryManagementCockpit
                  entries={entries}
                  cockpit={cockpit}
                  showHasNoRegistrations={registrationGroups.length === 0}
                  trialScopePending={trialScopePending}
                  trialClassesUnknown={trialClassesUnknown}
                  onRetryTrialClasses={() => void refetchTrialClasses()}
                  showId={selectedShowId}
                  {...(selectedShow?.name ? { showName: selectedShow.name } : {})}
                  busy={isProcessing}
                  lastEmailedMap={lastEmailedMap}
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
                  onEntryRemoved={handleEntryRemoved}
                  onBulkStatusChange={handleEnrollmentBulkStatusChange}
                  paymentLedger={paymentLedger}
                  onSendDecisionEmail={async (registrationId, message, amountDue) => {
                    await handleSendDecisionEmail(registrationId, message, amountDue);
                    const registrationIds = [
                      ...new Set(entries.map(entry => entry.registrationId).filter(Boolean)),
                    ];
                    refreshEmailLog(registrationIds);
                  }}
                  onRefresh={() => loadEntries(selectedShowId)}
                />
              </TrialSecretaryAccessProvider>
            </div>
          )}
        </>
      )}

      {selectedShowId && cockpitUrl.state.tab === 'exceptions' && (
        <EntryManagementExceptionPanes
          showId={selectedShowId}
          {...(selectedShow?.name ? { showName: selectedShow.name } : {})}
          exception={cockpitUrl.state.exception}
          pulledEntries={pulledEntries}
          entriesUnknown={Boolean(loadError)}
          entriesLoading={isLoading}
          registrationNeeded={registrationNeeded}
          onRefreshEntries={() => loadEntries(selectedShowId)}
          onMoveUpsChanged={() => {
            loadEntries(selectedShowId);
            refetchMoveUpRequestsCount();
          }}
          onOpenEntry={openEntryForm}
        />
      )}

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
          ignoreModificationDeadline
          asShowManager
          allowLeaveClass={false}
          canDelete={manageScope.status === 'resolved' && manageScope.canManage}
          onDeleted={entryIds => entryIds.forEach(handleEntryRemoved)}
          onRestored={() => loadEntries(selectedShowId)}
        />
      )}
    </div>
  );
};

export default EntryManagementPage;

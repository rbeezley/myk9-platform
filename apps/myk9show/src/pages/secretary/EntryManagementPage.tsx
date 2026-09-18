import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import WaitlistManagementPage from './WaitlistManagementPage/index';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { auditService } from '@/services/AuditService';
import { useShowManageScope } from '@/hooks/useShowManageScope';
import { trialSecretaryOnlyReason } from '@/features/actions/trialSecretaryAccess';
import { AuditAction } from '@/types/audit-types';
import { AlertCircle, Download, MoreHorizontal, Plus, UserCheck } from 'lucide-react';
import { SecretaryAddEntriesDecision } from '@/features/registration/SecretaryAddEntriesDecision';
import { TableSkeleton } from '@/components/common/SkeletonLoaders';

import { useEntryManagementData } from '@/hooks/useEntryManagementData';
import { useEntryManagementActions } from '@/hooks/useEntryManagementActions';
import {
  useEntryManagementTrialClasses,
  useEntryManagementTrialScope,
} from '@/hooks/useEntryManagementTrialScope';
import { ArmbandDialog, CompEntryDialog } from '@/components/entries/management';
import { EntryManagementCockpit } from '@/components/entries/management/EntryManagementCockpit';
import { EntryEditDialog } from '@/components/entries/EntryEditDialog';
import { MoveUpRequestsTab } from '@/components/entries/MoveUpRequestsTab';
import { PullManagementTab } from '@/components/entries/PullManagementTab';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  getCockpitNormalizationContext,
  normalizeEntryManagementCockpitParams,
  writeCockpitException,
  writeCockpitTab,
} from '@/components/entries/management/entryManagementCockpitParams';
import { groupEntriesByShowRegistration } from '@/components/entries/management/showRegistrationProjection';
import { CopyViewLinkButton } from '@/features/operational-views/CopyViewLinkButton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ShowDeskReturnLink } from '@/features/show-map/cockpit/ShowDeskReturnLink';
import { EntryManagementUnresolvedShow } from './EntryManagementUnresolvedShow';
import { registerCommandMenuContext } from '@/features/command-menu/commandMenuContextStore';

const PAGE_TABS: PrimaryTabDef[] = [
  { id: 'registrations', label: 'Registrations' },
  { id: 'exceptions', label: 'Exceptions' },
];

const EntryManagementPage: React.FC = () => {
  const params = useParams<{ showId?: string; id?: string }>();
  const urlShowId = params.showId ?? params.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

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
  // `ProtectedRoute(SECRETARY | SITE_ADMIN)`. "Add mail-in entry" is one of
  // them, so a club admin gets it greyed with a reason rather than a click that
  // dead-ends on a permission wall.
  const manageScope = useShowManageScope(urlShowId);
  const secretaryOnlyReason = trialSecretaryOnlyReason(manageScope);
  const registrationGroups = useMemo(() => groupEntriesByShowRegistration(entries), [entries]);
  // MYK9-632: the tab lists BOTH acts an exhibitor can leave behind. A pull
  // ('scratched') is the club's call; a withdrawal carrying one of the two
  // recognised reason codes is the premium's, and the secretary confirms it on
  // the same surface. A 'withdrawn' row with NO code is a secretary removal, not
  // an exhibitor act, and stays out.
  const pulledEntries = useMemo(
    () =>
      entries.filter(
        entry =>
          entry.rawEntryStatus === 'scratched' ||
          (entry.rawEntryStatus === 'withdrawn' &&
            (entry.withdrawalReasonCode === 'in_season' ||
              entry.withdrawalReasonCode === 'judge_change'))
      ),
    [entries]
  );
  const canValidateFocus =
    Boolean(selectedShowId) && loadedEntriesShowId === selectedShowId && !isLoading && !loadError;
  const normalizationContext = useMemo(
    () => (canValidateFocus ? getCockpitNormalizationContext(registrationGroups) : {}),
    [canValidateFocus, registrationGroups]
  );
  const cockpitUrl = useMemo(
    () => normalizeEntryManagementCockpitParams(searchParams, normalizationContext),
    [normalizationContext, searchParams]
  );
  const activePageTab = cockpitUrl.state.tab;
  const copyLinkHref = `${location.pathname}?${cockpitUrl.params.toString()}`.replace(/\?$/, '');
  const trialParam = cockpitUrl.state.trialId;

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

  // Leaving Entries resets the entry drill-down (trial/class/roster) so a later
  // return doesn't re-enter scoring/roster unexpectedly.
  const handlePageTabChange = (tab: string) => {
    setSearchParams(
      previous => writeCockpitTab(previous, tab === 'exceptions' ? 'exceptions' : 'registrations'),
      { replace: true }
    );
  };

  const {
    trialClasses,
    trialClassIds,
    isLoadingClasses,
    trialClassesUnknown,
    refetchTrialClasses,
  } = useEntryManagementTrialClasses(trialParam);

  const selectedShow = shows.find(s => s.id === selectedShowId) ?? null;

  const {
    isProcessing,
    armbandDialog,
    setArmbandDialog,
    handleStatusChange,
    handleAssignArmband,
    handleNextArmband,
    handleEnrollmentBulkStatusChange,
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
    setError,
    user,
  });

  const { trials, isLoadingTrials } = useEntryManagementTrialScope({
    selectedShowId,
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
    <div className="manager-content-container container mx-auto space-y-6 p-4 sm:p-6">
      <ShowDeskReturnLink showId={selectedShowId || urlShowId} />
      <div className="manager-page-header">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
            Entry Management
          </h1>
          {/*
            Name the show. Every accept, reject, refund and exhibitor email on
            this page is scoped to one show, and the secretary can arrive here
            from a bare `/secretary/entries` link that resolves the show from
            localStorage — so without this line they act on a show the page
            never named. The generic "Manage show entries, process payments…"
            tagline that used to sit here restated the H1 and carried no state.
            The fallback stays generic on purpose: an unresolved show must not
            be described as a named one.
          */}
          <p className="break-words text-muted-foreground">
            {selectedShow?.name ?? 'Manage entries, payments, and exhibitor email for one show'}
          </p>
        </div>
        <div className="manager-page-actions">
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="gap-2">
                <MoreHorizontal className="h-4 w-4" aria-hidden />
                More
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-2">
              <p className="text-sm font-semibold">Entry tools</p>
              <Button asChild variant="outline" size="sm" className="h-8 gap-2">
                <Link
                  to={`/shows/${encodeURIComponent(selectedShowId || urlShowId || '')}/show-day?tool=people-at-show`}
                >
                  <UserCheck className="h-4 w-4" aria-hidden />
                  Open Check-in desk
                </Link>
              </Button>
              <CopyViewLinkButton href={copyLinkHref} label="Copy view link" />
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                disabled={!selectedShowId || isProcessing}
                className="h-8 gap-2"
              >
                <Download className="h-4 w-4" />
                Export Full CSV
              </Button>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" disabled={!selectedShowId} className="gap-2">
                <Plus className="h-4 w-4" aria-hidden />
                Add entry
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto">
              <p className="mb-3 text-sm font-semibold">Who are you entering?</p>
              <SecretaryAddEntriesDecision
                showId={selectedShowId}
                mailInDisabledReason={secretaryOnlyReason}
              />
            </PopoverContent>
          </Popover>
        </div>
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
          didResolveShow={didResolveShow}
          showError={showError}
          onRetry={retryShowResolution}
          retryDisabled={isLoadingShows}
        />
      )}

      {/* Page-level tabs: Entries | Move-ups | Pulls | Waitlist */}
      {selectedShowId && (
        <PrimaryTabs tabs={PAGE_TABS} value={activePageTab} onValueChange={handlePageTabChange}>
          <TabsContent value="registrations">
            {/* No Show Selected — kept as loading guard while useEntryManagementData resolves the show */}
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
            Main Content — only when a show is selected, loading
            finished, AND no LOAD error. The `!loadError` gate keeps
            the page usable when an action error fires (which
            populates `error` separately) — action errors show as an
            inline Alert at the top while the entries table remains
            interactive.
          */}
            {selectedShowId && !isLoading && !loadError && (
              <div className="mt-6">
                <EntryManagementCockpit
                  entries={entries}
                  registrationGroups={registrationGroups}
                  cockpitState={cockpitUrl.state}
                  trials={trials}
                  trialClasses={trialClasses}
                  trialClassIds={trialClassIds}
                  trialClassesUnknown={trialClassesUnknown}
                  onRetryTrialClasses={() => void refetchTrialClasses()}
                  isLoadingTrials={isLoadingTrials}
                  isLoadingClasses={isLoadingClasses}
                  canValidateFocus={canValidateFocus}
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
                  onRemoveEntry={handleRemoveEntry}
                  onBulkStatusChange={handleEnrollmentBulkStatusChange}
                  onPaymentStatusChange={handleEnrollmentPaymentChange}
                  onSendDecisionEmail={async (registrationId, message, amountDue) => {
                    await handleSendDecisionEmail(registrationId, message, amountDue);
                    const registrationIds = [
                      ...new Set(entries.map(entry => entry.registrationId).filter(Boolean)),
                    ];
                    refreshEmailLog(registrationIds);
                  }}
                  onRefresh={() => loadEntries(selectedShowId)}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="exceptions">
            <div className="mt-6 space-y-4">
              <div className="flex flex-wrap gap-2" aria-label="Entry exceptions">
                {(
                  [
                    ['move-ups', 'Move-ups'],
                    // MYK9-632: one act, one word. The URL key `pulls` and the
                    // legacy `?tab=scratches` alias are unchanged — this is the
                    // label only.
                    ['pulls', 'Pulls'],
                    ['waitlist', 'Waitlist'],
                  ] as const
                ).map(([exception, label]) => (
                  <Button
                    key={exception}
                    type="button"
                    variant={cockpitUrl.state.exception === exception ? 'secondary' : 'ghost'}
                    aria-pressed={cockpitUrl.state.exception === exception}
                    onClick={() =>
                      setSearchParams(previous => writeCockpitException(previous, exception), {
                        replace: true,
                      })
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {selectedShowId && cockpitUrl.state.exception === 'move-ups' && (
                <Card>
                  <CardContent className="pt-6">
                    <MoveUpRequestsTab
                      showId={selectedShowId}
                      onRefresh={() => loadEntries(selectedShowId)}
                    />
                  </CardContent>
                </Card>
              )}
              {selectedShowId && cockpitUrl.state.exception === 'pulls' && (
                <Card>
                  <CardContent className="pt-6">
                    <PullManagementTab
                      showId={selectedShowId}
                      processedEntries={pulledEntries}
                      processedEntriesUnknown={Boolean(loadError)}
                      processedEntriesLoading={isLoading}
                      onRefresh={() => loadEntries(selectedShowId)}
                    />
                  </CardContent>
                </Card>
              )}
              {cockpitUrl.state.exception === 'waitlist' && (
                <WaitlistManagementPage showId={selectedShowId || undefined} />
              )}
            </div>
          </TabsContent>
        </PrimaryTabs>
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
        />
      )}
    </div>
  );
};

export default EntryManagementPage;

import { useEffect, useMemo, useReducer, useState } from 'react';
import type { EnrollmentLedgerControls } from '@/hooks/useEnrollmentLedgerActions';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useEmailStatus } from '@/hooks/useEmailStatus';
import { useJuniorDeclaredEntryIds } from '@/hooks/useJuniorDeclaredEntryIds';
import type { useEntryManagementCockpit } from '@/hooks/useEntryManagementCockpit';
import { useEntryDecisionLifecycleEmails } from '@/features/lifecycle-emails';
import { EntryRegistrationQueue } from './EntryRegistrationQueue';
import { TableSkeleton } from '@/components/common/SkeletonLoaders';
import { getEntryRegistrationRowId } from './showRegistrationProjection';
import { EntryFocusedRegistration } from './EntryFocusedRegistration';
import { EntryManagementBulkBar } from './EntryManagementBulkBar';
import {
  entryCockpitResponsiveReducer,
  initialEntryCockpitResponsiveState,
} from './entryManagementCockpitResponsive';
import {
  buildSelectedEntriesExportCsv,
  selectedEntriesExportFilename,
} from './entrySelectionExport';
import { downloadCsv } from '@/utils/downloadCsv';
import type {
  BulkActionResult,
  EntryClass,
  EntryManagementEntry,
} from '@/types/entry-management-types';
import type { CheckInStatus } from '@myk9/core';
import { EntryStatus } from '@/types/show-registration-types';
import { sendRegistrationConfirmationEmail } from '@/components/shows/RegistrationWorkflow/sendRegistrationConfirmationEmail';

// INTENT: `cockpit.state.queue` (set from the page's unified `ListViewTabs`) is
// the single source of registration-status filtering on Entry Management. Do
// not add a second status control: contradictory status filters create an
// honest-looking zero-registration state. Show-day check-in is also
// intentionally absent here; the page links to the canonical Check-in desk
// instead of duplicating that concern in registration management.

interface EntryManagementCockpitProps {
  entries: EntryManagementEntry[];
  /** Built by the PAGE (`useEntryManagementCockpit`) and passed down, so the
   * page's `ListViewTabs`/`ListFilterBar` and this list read one shared state
   * instead of each computing their own (MYK9-795). */
  cockpit: ReturnType<typeof useEntryManagementCockpit>;
  /** `registrationGroups` (unfiltered) is empty — the show itself has no
   * registrations, not just none matching the current queue/filters. */
  showHasNoRegistrations: boolean;
  /** A trial is selected but which classes it holds is still being read. */
  trialScopePending: boolean;
  /** A trial is selected but its class list could not be read, so trial
   * scoping cannot be applied and the counts are for the whole show. */
  trialClassesUnknown?: boolean;
  onRetryTrialClasses?: () => void;
  showId: string;
  showName?: string;
  busy?: boolean;
  lastEmailedMap?: Record<string, string>;
  onStatusChange: (
    entryId: string,
    status: EntryStatus,
    withdrawalReason?: string
  ) => boolean | void | Promise<boolean | void>;
  onCheckInStatusChange: (
    entry: EntryManagementEntry,
    entryClass: EntryClass,
    status: CheckInStatus
  ) => void;
  onOpenEditEntry?: (entry: EntryManagementEntry) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onOpenCompDialog: (entry: EntryManagementEntry) => void;
  onUncompEntry: (entryId: string) => void;
  onEntryRemoved: (entryId: string) => void;
  onBulkStatusChange: (
    entryIds: string[],
    status: EntryStatus,
    onFullSuccess?: () => void
  ) => BulkActionResult | Promise<BulkActionResult>;
  onSendDecisionEmail: (
    registrationId: string,
    message?: string,
    amountDue?: number
  ) => Promise<void>;
  onRefresh: () => void;
  paymentLedger: EnrollmentLedgerControls;
}

export function EntryManagementCockpit({
  entries,
  cockpit,
  showHasNoRegistrations,
  trialScopePending,
  trialClassesUnknown = false,
  onRetryTrialClasses,
  showId,
  showName,
  busy = false,
  lastEmailedMap = {},
  onStatusChange,
  onCheckInStatusChange,
  onOpenEditEntry,
  onOpenArmbandDialog,
  onOpenCompDialog,
  onUncompEntry,
  onEntryRemoved,
  onBulkStatusChange,
  onSendDecisionEmail,
  onRefresh,
  paymentLedger,
}: EntryManagementCockpitProps) {
  const focusedKey = cockpit.focusedGroup?.groupKey ?? null;
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [responsive, dispatchResponsive] = useReducer(
    entryCockpitResponsiveReducer,
    initialEntryCockpitResponsiveState
  );

  useEffect(() => {
    if (width !== null) {
      dispatchResponsive({
        type: 'measure',
        contentWidth: width,
        hasFocusedDetail: cockpit.state.registrationKey !== null,
      });
    }
  }, [cockpit.state.registrationKey, width]);

  const registrationIds = useMemo(
    () => [...new Set(entries.map(entry => entry.registrationId).filter(Boolean))],
    [entries]
  );
  const { data: emailStatusMap } = useEmailStatus(registrationIds);
  const { data: juniorDeclaredEntryIds } = useJuniorDeclaredEntryIds(showId);
  const lifecycleEmails = useEntryDecisionLifecycleEmails({ showId, showName, entries });
  const [resendCooldowns, setResendCooldowns] = useState<Record<string, number>>({});
  const isResendDisabled = (registrationId: string) =>
    (resendCooldowns[registrationId] ?? 0) > Date.now();

  const handleResendEmail = async (registrationId: string) => {
    setResendCooldowns(current => ({ ...current, [registrationId]: Date.now() + 60_000 }));
    try {
      const result = await sendRegistrationConfirmationEmail(registrationId);
      if (!result.ok) throw new Error(result.error);
      toast.success('Confirmation email resent');
    } catch {
      setResendCooldowns(current => {
        const next = { ...current };
        delete next[registrationId];
        return next;
      });
      toast.error('Failed to resend email');
    }
  };

  // Bulk resend (MYK9-795): dedupes to one send per registration, skips any
  // target `isResendDisabled` now reports (re-checked here, at dispatch —
  // `registrationIds` is already resolved fresh by the caller from the live
  // selection), and clears the selection afterward the same way the existing
  // Accept/Reject `runBulkAndClear` does, regardless of individual failures —
  // a partial send still moves the selection out from under a spent action,
  // and each attempt already reports its own toast.
  const handleBulkResendEmail = async (registrationIds: string[]) => {
    await Promise.allSettled(registrationIds.map(handleResendEmail));
    cockpit.selection.clearSelection();
  };

  const handleExportSelectedCSV = (selectedEntries: EntryManagementEntry[]) => {
    if (selectedEntries.length === 0) return;
    downloadCsv(selectedEntriesExportFilename(), buildSelectedEntriesExportCsv(selectedEntries));
  };

  const handleStatusChangeWithDecisionPrompt = async (
    entryId: string,
    status: EntryStatus,
    withdrawalReason?: string
  ) => {
    const entry = entries.find(candidate => candidate.id === entryId);
    const statusSaved = await onStatusChange(entryId, status, withdrawalReason);
    if (
      entry &&
      statusSaved !== false &&
      entry.registrationId &&
      (status === EntryStatus.ACCEPTED || status === EntryStatus.WAITLIST)
    ) {
      lifecycleEmails.openDecisionPrompt(
        { ...entry, entryStatus: status },
        status === EntryStatus.ACCEPTED ? 'accepted' : 'waitlisted'
      );
    }
    return statusSaved;
  };

  const selectedEntries = cockpit.selection.selectedItems.flatMap(group => group.entries);
  const showQueue = !responsive.compact || !responsive.detailOpen;
  const showDetail = !responsive.compact || responsive.detailOpen;

  return (
    <div ref={ref} className="space-y-4">
      {/* MYK9-635: "All registrations 514" beside a show page saying 517 entries
          read as a bucket that excluded Needs review. It never was — All is
          every queue — the two numbers count registrations and entries. Both
          come from one pass over the groups the list itself is built from, so
          the page states the pair rather than showing one and implying the
          other. Withheld under a scope or a search, where neither number would
          be true of the rows below -- see `useEntryManagementCockpit`. */}
      {!trialScopePending && cockpit.queueTotalsDescribeWholeShow && (
        <p className="text-sm text-muted-foreground" data-testid="registration-totals">
          {cockpit.queueTotals.registrationCount}{' '}
          {cockpit.queueTotals.registrationCount === 1 ? 'entry form' : 'entry forms'} &middot;{' '}
          {cockpit.queueTotals.entryCount}{' '}
          {cockpit.queueTotals.entryCount === 1 ? 'entry' : 'entries'}. The All view includes Needs
          review.
        </p>
      )}

      {cockpit.state.search && (
        <p role="status" className="text-sm text-muted-foreground">
          Search covers the whole show. Clear search to use the view, Trial and Class filters.
        </p>
      )}

      {/*
        Trial scope could not be applied.

        A trial is selected but its class list never loaded, so we do not know
        which registrations belong to it. The queue below is therefore the whole
        show, not the trial. Saying so is the only honest option: scoping to an
        empty class list would report zero registrations and zero queue counts
        as fact, and silently dropping the scope would let the secretary act on
        the wrong trial believing it was filtered.
      */}
      {trialClassesUnknown && !cockpit.state.search && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        >
          <span className="text-foreground">
            Couldn&rsquo;t load this trial&rsquo;s classes, so the list below covers the whole show,
            not just this trial.
          </span>
          {onRetryTrialClasses && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={onRetryTrialClasses}
            >
              Retry
            </Button>
          )}
        </div>
      )}

      <div
        className={cn(
          'grid items-start gap-4',
          !responsive.compact && 'grid-cols-[minmax(30rem,1.1fr)_minmax(25rem,.9fr)]'
        )}
      >
        {/*
          Trial picked, classes not back yet. `trialScopePending` is true here,
          so the queue would render EVERY registration in the show while
          appearing scoped to the trial -- and "Select all on page" would then
          bulk-act on another trial's entries. Refusing to scope is the right
          call once the read has failed, but during the read the honest answer
          is "not yet", not a superset presented as a subset.
        */}
        {(showQueue || showDetail) && trialScopePending && (
          <div role="status" aria-label="Loading this trial's entry forms" className="py-4">
            <TableSkeleton rows={6} columns={4} />
          </div>
        )}

        {showQueue && !trialScopePending && (
          <EntryRegistrationQueue
            groups={cockpit.page.items}
            focusedKey={focusedKey}
            selectedKeys={cockpit.selection.selectedIds}
            allSelected={cockpit.selection.isAllSelected}
            partiallySelected={cockpit.selection.isPartiallySelected}
            onFocus={group => {
              cockpit.setFocus(group.groupKey);
              dispatchResponsive({ type: 'open-detail' });
            }}
            onToggle={cockpit.selection.toggleItem}
            onToggleAll={cockpit.selection.toggleAll}
            rangeStart={cockpit.page.rangeStart}
            rangeEnd={cockpit.page.rangeEnd}
            total={cockpit.page.total}
            showHasNoRegistrations={showHasNoRegistrations}
            pageIndex={cockpit.page.pageIndex}
            pageCount={cockpit.page.pageCount}
            onPageChange={cockpit.setPageIndex}
            density={cockpit.state.density}
          />
        )}

        {showDetail && !trialScopePending && cockpit.focusedGroup && (
          <div
            className={cn(
              // Under the pinned show header (its measured `--show-header-h`) and the 3rem tab strip;
              // keep in step with `showStickyLayout`. Written out because Tailwind only sees literal class names.
              !responsive.compact &&
                'sticky top-[calc(var(--app-top-inset,3rem)+1rem)] lg:top-[calc(var(--app-top-inset,3rem)+var(--show-header-h,0px)+3rem+1rem)]'
            )}
          >
            <EntryFocusedRegistration
              key={cockpit.focusedGroup.groupKey}
              registration={cockpit.focusedGroup}
              {...(responsive.compact
                ? {
                    onBack: () => {
                      dispatchResponsive({ type: 'close-detail' as const });
                      cockpit.setFocus(null);
                      requestAnimationFrame(() => {
                        document
                          .getElementById(getEntryRegistrationRowId(focusedKey ?? ''))
                          ?.focus();
                      });
                    },
                  }
                : {})}
              onStatusChange={handleStatusChangeWithDecisionPrompt}
              onEntryRefunded={onRefresh}
              onEntryRestored={onRefresh}
              onCheckInStatusChange={onCheckInStatusChange}
              onOpenEditEntry={onOpenEditEntry}
              onOpenArmbandDialog={onOpenArmbandDialog}
              onCompEntry={entryId => {
                const entry = cockpit.focusedGroup?.entries.find(item => item.id === entryId);
                if (entry) onOpenCompDialog(entry);
              }}
              onUncompEntry={onUncompEntry}
              onEntryRemoved={onEntryRemoved}
              showCheckInStatus={false}
              matchingEntryIds={
                new Set(cockpit.matchingEntryIdsByGroup.get(cockpit.focusedGroup.groupKey) ?? [])
              }
              onBulkStatusChange={onBulkStatusChange}
              paymentLedger={paymentLedger}
              emailStatusMap={emailStatusMap}
              juniorDeclaredEntryIds={juniorDeclaredEntryIds}
              onResendEmail={handleResendEmail}
              isResendDisabled={isResendDisabled}
              onSendDecisionEmail={onSendDecisionEmail}
              lastDecisionEmailedAt={
                cockpit.focusedGroup.enrollmentId
                  ? lastEmailedMap[cockpit.focusedGroup.enrollmentId]
                  : undefined
              }
              lifecycleDecisionEmailStatusMap={lifecycleEmails.statusMap}
              onReviewLifecycleEmail={lifecycleEmails.reviewReadyEmail}
              onPrepareCorrectionEmail={lifecycleEmails.prepareCorrectionEmail}
            />
          </div>
        )}
      </div>

      <EntryManagementBulkBar
        registrations={cockpit.selection.selectedCount}
        selectedEntries={selectedEntries}
        onBulkStatusChange={onBulkStatusChange}
        onClear={cockpit.selection.clearSelection}
        busy={busy}
        isResendDisabled={isResendDisabled}
        onBulkResend={handleBulkResendEmail}
        onExportSelected={handleExportSelectedCSV}
      />
      {lifecycleEmails.dialog}
    </div>
  );
}

import { useEffect, useMemo, useReducer, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useEmailStatus } from '@/hooks/useEmailStatus';
import { useEntryManagementCockpit } from '@/hooks/useEntryManagementCockpit';
import { useEntryDecisionLifecycleEmails } from '@/features/lifecycle-emails';
import { TrialClassFilters } from './TrialClassFilters';
import { EntryRegistrationQueue } from './EntryRegistrationQueue';
import { getEntryRegistrationRowId } from './showRegistrationProjection';
import { EntryFocusedRegistration } from './EntryFocusedRegistration';
import { EntryRegistrationSelectionToolbar } from './EntryRegistrationSelectionToolbar';
import { DensityControl } from '@/features/operational-views/DensityControl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  entryCockpitResponsiveReducer,
  initialEntryCockpitResponsiveState,
} from './entryManagementCockpitResponsive';
import type {
  EntryManagementTrial,
  EntryManagementTrialClass,
} from '@/hooks/useEntryManagementTrialScope';
import type { ShowRegistrationGroup } from './showRegistrationProjection';
import type { EntryManagementCockpitState } from './entryManagementCockpitParams';
import type {
  BulkActionResult,
  EntryClass,
  EntryManagementEntry,
} from '@/types/entry-management-types';
import type { CheckInStatus } from '@myk9/core';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { sendRegistrationConfirmationEmail } from '@/components/shows/RegistrationWorkflow/sendRegistrationConfirmationEmail';

const QUEUES = [
  { id: 'needs-review', label: 'Needs review' },
  { id: 'missing-information', label: 'Missing information' },
  { id: 'payment-due', label: 'Payment due' },
  { id: 'all', label: 'All registrations' },
] as const;

interface EntryManagementCockpitProps {
  entries: EntryManagementEntry[];
  registrationGroups: ShowRegistrationGroup[];
  cockpitState: EntryManagementCockpitState;
  trials: EntryManagementTrial[];
  trialClasses: EntryManagementTrialClass[];
  /** `undefined` when the trial's class list could not be read — see
   * `useEntryManagementTrialClasses`. Never coerce this to `[]`. */
  trialClassIds: readonly string[] | undefined;
  isLoadingTrials: boolean;
  isLoadingClasses: boolean;
  /** A trial is selected but its classes are unknown, so trial scoping cannot
   * be applied and the counts below are for the whole show, not the trial. */
  trialClassesUnknown?: boolean;
  onRetryTrialClasses?: () => void;
  canValidateFocus?: boolean;
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
  onRemoveEntry: (entryId: string) => void;
  onBulkStatusChange: (
    entryIds: string[],
    status: EntryStatus,
    onFullSuccess?: () => void
  ) => BulkActionResult | Promise<BulkActionResult>;
  onBulkCheckIn: (
    entryIds: string[],
    onFullSuccess?: () => void
  ) => BulkActionResult | Promise<BulkActionResult>;
  onPaymentStatusChange: (
    enrollmentId: string,
    status: PaymentStatus,
    reference?: string | null,
    paidAmount?: number | null,
    refundAmount?: number | null,
    refundNotes?: string | null,
    checkNumber?: string | null
  ) => void;
  onSendDecisionEmail: (
    registrationId: string,
    message?: string,
    amountDue?: number
  ) => Promise<void>;
  onRefresh: () => void;
}

export function EntryManagementCockpit({
  entries,
  registrationGroups,
  cockpitState,
  trials,
  trialClasses,
  trialClassIds,
  isLoadingTrials,
  isLoadingClasses,
  trialClassesUnknown = false,
  onRetryTrialClasses,
  canValidateFocus = true,
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
  onRemoveEntry,
  onBulkStatusChange,
  onBulkCheckIn,
  onPaymentStatusChange,
  onSendDecisionEmail,
  onRefresh,
}: EntryManagementCockpitProps) {
  const cockpit = useEntryManagementCockpit({
    groups: registrationGroups,
    state: cockpitState,
    trialClassIds,
    canValidateFocus,
  });
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
  const lifecycleEmails = useEntryDecisionLifecycleEmails({ showId, showName, entries });
  const [resendCooldowns, setResendCooldowns] = useState<Record<string, number>>({});

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
    <div ref={ref} className={cn('space-y-4', cockpit.selection.selectedCount > 0 && 'pb-32')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2 pb-1" aria-label="Registration queues">
          {QUEUES.map(queue => (
            <Button
              key={queue.id}
              type="button"
              variant={cockpit.state.queue === queue.id ? 'secondary' : 'ghost'}
              disabled={Boolean(cockpit.state.search)}
              className={cn(
                'min-h-10 shrink-0 gap-3',
                cockpit.state.queue === queue.id && 'border border-primary/30 bg-primary/10'
              )}
              onClick={() => cockpit.setQueue(queue.id)}
            >
              {queue.label}
              <span className="text-xs tabular-nums text-muted-foreground">
                {cockpit.queueCounts[queue.id]}
              </span>
            </Button>
          ))}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="min-h-10 shrink-0 gap-2">
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Density
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto">
            <p className="mb-2 text-sm font-semibold">Registration row density</p>
            <DensityControl density={cockpit.state.density} onChange={cockpit.setDensity} />
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(18rem,1fr)_auto]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={cockpit.state.search}
            onChange={event => cockpit.setSearch(event.target.value)}
            placeholder="Search exhibitor, dog, handler, armband, confirmation, class…"
            className="min-h-11 pl-9"
            aria-label="Search all show registrations"
          />
        </div>
        <TrialClassFilters
          trials={trials}
          classes={trialClasses}
          trialFilter={cockpit.state.trialId}
          classFilter={cockpit.state.classId}
          onTrialChange={trialId => cockpit.setScope(trialId)}
          onClassChange={classId => cockpit.setScope(cockpit.state.trialId, classId)}
          isLoadingTrials={isLoadingTrials}
          isLoadingClasses={isLoadingClasses}
          disabled={Boolean(cockpit.state.search)}
        />
      </div>

      {cockpit.state.search && (
        <p role="status" className="text-sm text-muted-foreground">
          Search covers the whole show. Clear search to use queue, Trial, and Class filters.
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
        {showQueue && (
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
            // `registrationGroups` is every registration in the show, before any
            // queue, scope or search narrowing, so an empty one means the show
            // itself is empty rather than the filters being wrong.
            showHasNoRegistrations={registrationGroups.length === 0}
            pageIndex={cockpit.page.pageIndex}
            pageCount={cockpit.page.pageCount}
            onPageChange={cockpit.setPageIndex}
            density={cockpit.state.density}
          />
        )}

        {showDetail && cockpit.focusedGroup && (
          <div className={cn(!responsive.compact && 'sticky top-4')}>
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
              onCheckInStatusChange={onCheckInStatusChange}
              onOpenEditEntry={onOpenEditEntry}
              onOpenArmbandDialog={onOpenArmbandDialog}
              onCompEntry={entryId => {
                const entry = cockpit.focusedGroup?.entries.find(item => item.id === entryId);
                if (entry) onOpenCompDialog(entry);
              }}
              onUncompEntry={onUncompEntry}
              onRemoveEntry={onRemoveEntry}
              showCheckInStatus={false}
              matchingEntryIds={
                new Set(cockpit.matchingEntryIdsByGroup.get(cockpit.focusedGroup.groupKey) ?? [])
              }
              onBulkStatusChange={onBulkStatusChange}
              onBulkCheckIn={onBulkCheckIn}
              onPaymentStatusChange={onPaymentStatusChange}
              emailStatusMap={emailStatusMap}
              onResendEmail={handleResendEmail}
              isResendDisabled={registrationId =>
                (resendCooldowns[registrationId] ?? 0) > Date.now()
              }
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

      <EntryRegistrationSelectionToolbar
        registrations={cockpit.selection.selectedCount}
        selectedEntries={selectedEntries}
        onBulkStatusChange={onBulkStatusChange}
        onBulkCheckIn={onBulkCheckIn}
        onClear={cockpit.selection.clearSelection}
        busy={busy}
      />
      {lifecycleEmails.dialog}
    </div>
  );
}

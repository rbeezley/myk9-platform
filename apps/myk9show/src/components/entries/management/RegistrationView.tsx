import React, { useMemo, useState } from 'react';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { toast } from 'sonner';
import { useEmailStatus } from '@/hooks/useEmailStatus';
import { supabase } from '@/lib/supabase';
import { useEntryDecisionLifecycleEmails } from '@/features/lifecycle-emails';
import { ListControls } from '@/components/common/ListControls';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useElementWidth } from '@/hooks/useElementWidth';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { Search, Users } from 'lucide-react';

import { EntryStatsCards } from './EntryStatsCards';
import { EnrollmentCard } from './EnrollmentCard';
import { EntriesTableView } from './EntriesTableView';
import { EntryBulkActionsBar } from './EntryBulkActionsBar';
import { EntryWorkModeSwitch } from './EntryWorkModeSwitch';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import {
  ENTRY_MANAGEMENT_FILTERS,
  ENTRY_WORK_MODE_PRESETS,
  ENTRY_VIEW_MODES,
  getEntryManagementEmptyStateMessage,
  type EntryAttentionFilter,
  type EntryManagementViewMode,
  type EntryWorkMode,
} from './entryManagementFilters';
import { shouldUseEntryCards } from './entryManagementResponsive';
import { EntryManagementViewControls } from './EntryManagementViewControls';
import type {
  EntryManagementOperationalView,
  EntryManagementPresetId,
  OperationalViewDensity,
} from '@/features/operational-views/operationalViews';

import type {
  BulkActionResult,
  EntryClass,
  EntryManagementEntry,
  EntryStats,
} from '@/types/entry-management-types';
import type { CheckInStatus } from '@myk9/core';

/** Stable identity so useBulkSelection's memoized selectors don't churn each render. */
const getEntryId = (entry: EntryManagementEntry) => entry.id;
const ENROLLMENT_CARD_PAGE_SIZE = 25;

interface RegistrationViewProps {
  /** Entry stats for the stats cards */
  stats: EntryStats;
  /** Search term for filtering */
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  /** Payment filter */
  paymentFilter: string;
  setPaymentFilter: (v: string) => void;
  /** Attention filter state */
  attentionFilter: EntryAttentionFilter;
  setAttentionFilter: (filter: EntryAttentionFilter) => void;
  /** Work mode preset state */
  workMode: EntryWorkMode;
  setWorkMode: (mode: EntryWorkMode) => void;
  /** Apply a curated Entry Management preset (Design Decision 2). */
  applyPreset: (presetId: EntryManagementPresetId) => void;
  /** Apply a full restored/saved view (Design Decision 1 adapter). */
  applyView: (view: EntryManagementOperationalView) => void;
  /** Display density (Design Decision 3) — layout only, never hides identity/status/selection/actions. */
  density: OperationalViewDensity;
  setDensity: (density: OperationalViewDensity) => void;
  /** Entry list view mode */
  entryViewMode: EntryManagementViewMode;
  setEntryViewMode: (view: EntryManagementViewMode) => void;
  /**
   * Current trial/class scope (URL-backed on the page). Used only to derive
   * the selection reset key (Design Decision 4) — a scope change is a view
   * identity change even though attention/payment/mode/view stay the same.
   */
  trialFilter?: string | null;
  classFilter?: string | null;
  /** Filtered entries to display */
  filteredEntries: EntryManagementEntry[];
  /** Selected show id, used for canonical add-entry links. */
  showId?: string | undefined;
  /** Authenticated user id, threaded from the page (already read via `useEntryManagementData`) rather than a second `useAuthContext` subscription here. */
  currentUserId?: string | undefined;
  /** Selected show name, used in reviewed lifecycle email previews. */
  showName?: string | undefined;
  /** All entries (for looking up entry by id in comp handler) */
  entries: EntryManagementEntry[];
  /** Bulk enrollment-level action handlers */
  onBulkStatusChange: (
    entryIds: string[],
    status: EntryStatus
  ) => BulkActionResult | Promise<BulkActionResult>;
  onBulkCheckIn: (entryIds: string[]) => BulkActionResult | Promise<BulkActionResult>;
  /** True while a bulk batch is in flight — disables the bulk bar controls. */
  bulkBusy?: boolean;
  onPaymentStatusChange: (
    enrollmentId: string,
    status: PaymentStatus,
    reference?: string | null,
    paidAmount?: number | null,
    refundAmount?: number | null,
    refundNotes?: string | null,
    checkNumber?: string | null
  ) => void;
  /** Status change handler */
  onStatusChange: (
    entryId: string,
    status: EntryStatus
  ) => boolean | void | Promise<boolean | void>;
  /** Check-in inline handler */
  onCheckInStatusChange: (
    entry: EntryManagementEntry,
    cls: EntryClass,
    status: CheckInStatus
  ) => void;
  /** Dialog openers */
  onOpenEditEntry?: ((entry: EntryManagementEntry) => void) | undefined;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onOpenCompDialog: (entry: EntryManagementEntry) => void;
  onUncompEntry: (entryId: string) => void;
  onRemoveEntry: (entryId: string) => void;
  /** Reload entries callback */
  onRefresh: () => void;
  /** Entries grouped by enrollment/order for the list view */
  enrollmentGroups: EnrollmentGroup[];
  /** Clears all entry and scope filters for the filtered-empty recovery action. */
  onResetFilters: () => void;
  hasActiveScopeFilters: boolean;
  onSendDecisionEmail: (
    registrationId: string,
    message?: string,
    amountDue?: number
  ) => Promise<void>;
  lastEmailedMap?: Record<string, string>;
}

/**
 * Registration view for the Entry Management page.
 * Shows stats, filters, bulk actions, and tabbed entry lists.
 */
export const RegistrationView: React.FC<RegistrationViewProps> = ({
  stats,
  searchTerm,
  setSearchTerm,
  paymentFilter,
  setPaymentFilter,
  attentionFilter,
  setAttentionFilter,
  workMode,
  setWorkMode,
  applyPreset,
  applyView,
  density,
  setDensity,
  entryViewMode,
  setEntryViewMode,
  trialFilter = null,
  classFilter = null,
  filteredEntries,
  showId,
  currentUserId,
  showName,
  entries,
  onBulkStatusChange,
  onBulkCheckIn,
  bulkBusy = false,
  onPaymentStatusChange,
  onStatusChange,
  onCheckInStatusChange,
  onOpenEditEntry,
  onOpenArmbandDialog,
  onOpenCompDialog,
  onUncompEntry,
  onRemoveEntry,
  onRefresh,
  enrollmentGroups,
  onResetFilters,
  hasActiveScopeFilters,
  onSendDecisionEmail,
  lastEmailedMap = {},
}) => {
  // Multi-select for the table view (lifted here so the bulk bar can clear it and
  // select-all spans the full filtered set, not just the current page).
  // Selection reset key (Design Decision 4): clears the whole selection
  // whenever what the secretary is looking at changes — a preset apply,
  // a filter change, or a trial/class scope change — even if a coincidental
  // filtered-entries overlap would otherwise leave a stale id selected.
  //
  // `density` is deliberately EXCLUDED: it's display-only (row set/membership
  // is unchanged), so changing it must not clear an in-progress selection.
  const viewIdentityKey = `${attentionFilter}|${paymentFilter}|${workMode}|${entryViewMode}|${trialFilter ?? ''}|${classFilter ?? ''}`;
  const selection = useBulkSelection({
    items: filteredEntries,
    getItemId: getEntryId,
    // Drop selections for entries filtered out (search/payment/trial/class/tab) so
    // they can't resurface and be bulk-edited when a filter is later removed.
    pruneToItems: true,
    resetKey: viewIdentityKey,
  });
  const tableSelection = useMemo(
    () => ({
      isSelected: selection.isSelected,
      toggleItem: selection.toggleItem,
      isAllSelected: selection.isAllSelected,
      isPartiallySelected: selection.isPartiallySelected,
      toggleAll: selection.toggleAll,
    }),
    [
      selection.isSelected,
      selection.toggleItem,
      selection.isAllSelected,
      selection.isPartiallySelected,
      selection.toggleAll,
    ]
  );
  const enrollmentGroupKeys = useMemo(
    () => enrollmentGroups.map(group => group.groupKey),
    [enrollmentGroups]
  );
  const [enrollmentPage, setEnrollmentPage] = useState(() => ({
    groupKeys: enrollmentGroupKeys,
    pageIndex: 0,
  }));
  const resetEnrollmentPage = () =>
    setEnrollmentPage({ groupKeys: enrollmentGroupKeys, pageIndex: 0 });

  // Clear selection on attention-filter change (avoids carrying a selection into a different
  // status bucket). Done in the handler, not an effect, per the no-setState-in-effect rule.
  const handleAttentionFilterChange = (filter: EntryAttentionFilter) => {
    selection.clearSelection();
    resetEnrollmentPage();
    setAttentionFilter(filter);
  };

  const handleWorkModeChange = (mode: EntryWorkMode) => {
    const preset = ENTRY_WORK_MODE_PRESETS[mode];
    if (
      mode === workMode &&
      attentionFilter === preset.attention &&
      paymentFilter === preset.payment &&
      entryViewMode === preset.view
    ) {
      return;
    }

    selection.clearSelection();
    resetEnrollmentPage();
    setWorkMode(mode);
  };

  // "Payment due" / "All entries" — the two curated presets not already
  // expressed by a work mode (see EntryWorkModeSwitch's EXTRA_PRESETS).
  // Design Decision 4: applying a preset clears the active selection.
  const handleApplyPreset = (presetId: EntryManagementPresetId) => {
    selection.clearSelection();
    resetEnrollmentPage();
    applyPreset(presetId);
  };

  // Which (if any) of the non-work-mode curated presets matches the current
  // filter state, for the extra preset buttons' pressed state.
  const activeExtraPresetId: EntryManagementPresetId | null =
    workMode === 'review' &&
    entryViewMode === 'table' &&
    attentionFilter === 'accepted' &&
    paymentFilter === PaymentStatus.PENDING
      ? 'payment-due'
      : workMode === 'review' &&
          entryViewMode === 'table' &&
          attentionFilter === 'all' &&
          paymentFilter === 'all'
        ? 'all-entries'
        : null;

  // Email status tracking (self-contained)
  const registrationIds = useMemo(
    () => [...new Set(entries.map(e => e.registrationId).filter(Boolean))],
    [entries]
  );
  const { data: emailStatusMap } = useEmailStatus(registrationIds);
  const isMobileViewport = useMediaQuery('(max-width: 767px)');
  const { ref: registrationViewRef, width: contentWidth } = useElementWidth<HTMLDivElement>();
  const useCardsForContent = shouldUseEntryCards(contentWidth, isMobileViewport);

  // Resend cooldown state (registrationId -> cooldown expiry timestamp)
  const [resendCooldowns, setResendCooldowns] = useState<Record<string, number>>({});
  const lifecycleEmails = useEntryDecisionLifecycleEmails({ showId, showName, entries });

  const handleResendEmail = async (registrationId: string) => {
    setResendCooldowns(prev => ({ ...prev, [registrationId]: Date.now() + 60_000 }));
    try {
      const { error } = await supabase.functions.invoke('send-registration-email', {
        body: { registrationId },
      });
      if (error) throw error;
      toast.success('Confirmation email resent');
    } catch {
      setResendCooldowns(prev => {
        const next = { ...prev };
        delete next[registrationId];
        return next;
      });
      toast.error('Failed to resend email');
    }
  };

  const handleApplyView = (view: EntryManagementOperationalView) => {
    selection.clearSelection();
    resetEnrollmentPage();
    applyView(view);
  };

  const isResendDisabled = (registrationId: string) =>
    (resendCooldowns[registrationId] || 0) > Date.now();

  const handleStatusChangeWithDecisionPrompt = async (entryId: string, status: EntryStatus) => {
    const entry = entries.find(candidate => candidate.id === entryId);
    const statusSaved = await onStatusChange(entryId, status);

    if (!entry || !onSendDecisionEmail) return;
    if (statusSaved === false) return;
    if (status !== EntryStatus.ACCEPTED && status !== EntryStatus.WAITLIST) return;
    if (!entry.registrationId) return;

    lifecycleEmails.openDecisionPrompt(
      { ...entry, entryStatus: status },
      status === EntryStatus.ACCEPTED ? 'accepted' : 'waitlisted'
    );
  };
  const hasSearchFilter = searchTerm.trim().length > 0;
  const isTrulyEmpty =
    entries.length === 0 &&
    !hasActiveScopeFilters &&
    !hasSearchFilter &&
    paymentFilter === 'all' &&
    attentionFilter === 'all';
  const emptyStateMessage = getEntryManagementEmptyStateMessage({
    attention: attentionFilter,
    hasSearch: hasSearchFilter,
    payment: paymentFilter,
  });
  const emptyStateContent = (
    <EmptyState
      icon={isTrulyEmpty ? Users : Search}
      title={emptyStateMessage}
      action={
        isTrulyEmpty
          ? showId
            ? {
                label: 'Add mail-in entry',
                href: `/secretary/register/${encodeURIComponent(showId)}`,
              }
            : null
          : { label: 'Clear filters', onClick: onResetFilters }
      }
      variant={isTrulyEmpty ? 'default' : 'filter'}
      size="sm"
    />
  );
  const enrollmentPageCount = Math.max(
    1,
    Math.ceil(enrollmentGroups.length / ENROLLMENT_CARD_PAGE_SIZE)
  );
  const isSameEnrollmentGroupSet =
    enrollmentPage.groupKeys.length === enrollmentGroupKeys.length &&
    enrollmentPage.groupKeys.every((groupKey, index) => groupKey === enrollmentGroupKeys[index]);
  const currentEnrollmentPageIndex = isSameEnrollmentGroupSet
    ? Math.min(enrollmentPage.pageIndex, enrollmentPageCount - 1)
    : 0;
  const enrollmentPageStart = currentEnrollmentPageIndex * ENROLLMENT_CARD_PAGE_SIZE;
  const visibleEnrollmentGroups = enrollmentGroups.slice(
    enrollmentPageStart,
    enrollmentPageStart + ENROLLMENT_CARD_PAGE_SIZE
  );
  const enrollmentCardList = (
    <div className="space-y-3">
      {enrollmentGroups.length > 0 ? (
        <>
          {visibleEnrollmentGroups.map(group => (
            <EnrollmentCard
              key={group.groupKey}
              group={group}
              onStatusChange={handleStatusChangeWithDecisionPrompt}
              onEntryRefunded={onRefresh}
              onCheckInStatusChange={onCheckInStatusChange}
              onOpenEditEntry={onOpenEditEntry}
              onOpenArmbandDialog={onOpenArmbandDialog}
              onCompEntry={(entryId: string) => {
                const entry = group.entries.find(e => e.id === entryId);
                if (entry) onOpenCompDialog(entry);
              }}
              onUncompEntry={onUncompEntry}
              onRemoveEntry={onRemoveEntry}
              onBulkStatusChange={onBulkStatusChange}
              onBulkCheckIn={onBulkCheckIn}
              onPaymentStatusChange={onPaymentStatusChange}
              emailStatusMap={emailStatusMap}
              onResendEmail={handleResendEmail}
              isResendDisabled={isResendDisabled}
              onSendDecisionEmail={onSendDecisionEmail}
              lastDecisionEmailedAt={
                group.enrollmentId ? lastEmailedMap[group.enrollmentId] : undefined
              }
              lifecycleDecisionEmailStatusMap={lifecycleEmails.statusMap}
              onReviewLifecycleEmail={lifecycleEmails.reviewReadyEmail}
              onPrepareCorrectionEmail={lifecycleEmails.prepareCorrectionEmail}
            />
          ))}
          {enrollmentPageCount > 1 && (
            <nav
              className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              aria-label="Enrollment card pagination"
            >
              <p className="text-sm text-muted-foreground">
                Showing {enrollmentPageStart + 1}–
                {Math.min(enrollmentPageStart + ENROLLMENT_CARD_PAGE_SIZE, enrollmentGroups.length)}{' '}
                of {enrollmentGroups.length} enrollments
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 flex-1 sm:flex-none"
                  onClick={() =>
                    setEnrollmentPage({
                      groupKeys: enrollmentGroupKeys,
                      pageIndex: currentEnrollmentPageIndex - 1,
                    })
                  }
                  disabled={currentEnrollmentPageIndex === 0}
                  aria-label="Go to previous enrollment page"
                >
                  Previous
                </Button>
                <span className="whitespace-nowrap text-sm text-muted-foreground">
                  Page {currentEnrollmentPageIndex + 1} of {enrollmentPageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 flex-1 sm:flex-none"
                  onClick={() =>
                    setEnrollmentPage({
                      groupKeys: enrollmentGroupKeys,
                      pageIndex: currentEnrollmentPageIndex + 1,
                    })
                  }
                  disabled={currentEnrollmentPageIndex === enrollmentPageCount - 1}
                  aria-label="Go to next enrollment page"
                >
                  Next
                </Button>
              </div>
            </nav>
          )}
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border/70 bg-card/60 px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyStateContent}
        </div>
      )}
    </div>
  );

  return (
    <div ref={registrationViewRef} className="space-y-6">
      {/* Stats Overview */}
      <EntryStatsCards stats={stats} />

      <EntryWorkModeSwitch
        value={workMode}
        onChange={handleWorkModeChange}
        activeExtraPresetId={activeExtraPresetId}
        onSelectExtraPreset={handleApplyPreset}
      />

      {/* Display density + personal saved views (tasks.md 3.2/3.3) */}
      <EntryManagementViewControls
        density={density}
        onDensityChange={setDensity}
        userId={currentUserId}
        showId={showId}
        trialFilter={trialFilter}
        classFilter={classFilter}
        attentionFilter={attentionFilter}
        paymentFilter={paymentFilter}
        workMode={workMode}
        entryViewMode={entryViewMode}
        onApplyView={handleApplyView}
      />

      {/* Search, filters, and view mode */}
      <ListControls
        search={searchTerm}
        onSearchChange={value => {
          resetEnrollmentPage();
          setSearchTerm(value);
        }}
        searchPlaceholder="Search entries..."
        filters={ENTRY_MANAGEMENT_FILTERS}
        filterValues={{
          attention: attentionFilter === 'all' ? '' : attentionFilter,
          payment: paymentFilter === 'all' ? '' : paymentFilter,
        }}
        onFilterChange={(key, value) => {
          if (key === 'attention') {
            handleAttentionFilterChange((value || 'all') as EntryAttentionFilter);
          }
          if (key === 'payment') {
            selection.clearSelection();
            resetEnrollmentPage();
            setPaymentFilter(value || 'all');
          }
        }}
        viewMode={entryViewMode}
        onViewModeChange={mode => {
          selection.clearSelection();
          resetEnrollmentPage();
          setEntryViewMode(mode as EntryManagementViewMode);
        }}
        viewModes={ENTRY_VIEW_MODES}
        resultsShowing={filteredEntries.length}
        resultsTotal={entries.length}
        filtered={
          filteredEntries.length !== entries.length ||
          hasSearchFilter ||
          paymentFilter !== 'all' ||
          attentionFilter !== 'all'
        }
        entityName="entries"
      />

      {entryViewMode === 'table' && useCardsForContent ? (
        enrollmentCardList
      ) : entryViewMode === 'table' ? (
        <EntriesTableView
          entries={filteredEntries}
          emailStatusMap={emailStatusMap}
          onResendEmail={handleResendEmail}
          isResendDisabled={isResendDisabled}
          onStatusChange={handleStatusChangeWithDecisionPrompt}
          onCheckInEntry={entryId => onBulkCheckIn([entryId])}
          onOpenEditEntry={onOpenEditEntry}
          onOpenArmbandDialog={onOpenArmbandDialog}
          onOpenCompDialog={onOpenCompDialog}
          onUncompEntry={onUncompEntry}
          onRemoveEntry={onRemoveEntry}
          onEntryRefunded={onRefresh}
          selection={tableSelection}
          emptyState={emptyStateContent}
          showReviewActions={workMode === 'review'}
          density={density}
          lifecycleDecisionEmailStatusMap={lifecycleEmails.statusMap}
          onReviewLifecycleEmail={lifecycleEmails.reviewReadyEmail}
          onPrepareCorrectionEmail={lifecycleEmails.prepareCorrectionEmail}
        />
      ) : (
        enrollmentCardList
      )}

      {entryViewMode === 'table' && (
        <EntryBulkActionsBar
          selectedEntries={selection.selectedItems}
          onBulkStatusChange={onBulkStatusChange}
          onBulkCheckIn={onBulkCheckIn}
          onClear={selection.clearSelection}
          busy={bulkBusy}
        />
      )}

      {lifecycleEmails.dialog}
    </div>
  );
};

export default RegistrationView;

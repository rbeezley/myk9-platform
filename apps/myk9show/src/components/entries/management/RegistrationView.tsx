import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { toast } from 'sonner';
import { useEmailStatus } from '@/hooks/useEmailStatus';
import { supabase } from '@/lib/supabase';
import {
  LifecycleEmailPreviewDialog,
  buildLifecycleEmailIdempotencyKey,
  saveLifecycleEmailJobForLater,
  type LifecycleEmailStepType,
} from '@/features/lifecycle-emails';
import { ListControls } from '@/components/common/ListControls';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Button } from '@/components/ui/button';

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

import type {
  BulkActionResult,
  EntryClass,
  EntryManagementEntry,
  EntryStats,
} from '@/types/entry-management-types';
import type { CheckInStatus } from '@myk9/core';

/** Stable identity so useBulkSelection's memoized selectors don't churn each render. */
const getEntryId = (entry: EntryManagementEntry) => entry.id;

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
  /** Entry list view mode */
  entryViewMode: EntryManagementViewMode;
  setEntryViewMode: (view: EntryManagementViewMode) => void;
  /** Filtered entries to display */
  filteredEntries: EntryManagementEntry[];
  /** Selected show id, used for canonical add-entry links. */
  showId?: string | undefined;
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
  onPaymentStatusChange: (
    enrollmentId: string,
    status: PaymentStatus,
    reference?: string | null,
    paidAmount?: number | null
  ) => void;
  /** Status change handler */
  onStatusChange: (entryId: string, status: EntryStatus) => void | Promise<void>;
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
  entryViewMode,
  setEntryViewMode,
  filteredEntries,
  showId,
  showName,
  entries,
  onBulkStatusChange,
  onBulkCheckIn,
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
  onSendDecisionEmail,
  lastEmailedMap = {},
}) => {
  // Multi-select for the table view (lifted here so the bulk bar can clear it and
  // select-all spans the full filtered set, not just the current page).
  const selection = useBulkSelection({
    items: filteredEntries,
    getItemId: getEntryId,
    // Drop selections for entries filtered out (search/payment/trial/class/tab) so
    // they can't resurface and be bulk-edited when a filter is later removed.
    pruneToItems: true,
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

  // Clear selection on attention-filter change (avoids carrying a selection into a different
  // status bucket). Done in the handler, not an effect, per the no-setState-in-effect rule.
  const handleAttentionFilterChange = (filter: EntryAttentionFilter) => {
    selection.clearSelection();
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
    setWorkMode(mode);
  };

  // Email status tracking (self-contained)
  const registrationIds = useMemo(
    () => [...new Set(entries.map(e => e.registrationId).filter(Boolean))],
    [entries]
  );
  const { data: emailStatusMap } = useEmailStatus(registrationIds);
  const isMobileViewport = useMediaQuery('(max-width: 767px)');

  // Resend cooldown state (registrationId -> cooldown expiry timestamp)
  const [resendCooldowns, setResendCooldowns] = useState<Record<string, number>>({});
  const [decisionEmailPrompt, setDecisionEmailPrompt] = useState<{
    entry: EntryManagementEntry;
    stepType: Extract<LifecycleEmailStepType, 'accepted' | 'waitlisted'>;
  } | null>(null);

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

  const isResendDisabled = (registrationId: string) =>
    (resendCooldowns[registrationId] || 0) > Date.now();

  const handleStatusChangeWithDecisionPrompt = async (entryId: string, status: EntryStatus) => {
    const entry = entries.find(candidate => candidate.id === entryId);
    await onStatusChange(entryId, status);

    if (!entry || !onSendDecisionEmail) return;
    if (status !== EntryStatus.ACCEPTED && status !== EntryStatus.WAITLIST) return;
    if (!entry.registrationId) return;

    setDecisionEmailPrompt({
      entry: { ...entry, entryStatus: status },
      stepType: status === EntryStatus.ACCEPTED ? 'accepted' : 'waitlisted',
    });
  };
  const hasSearchFilter = searchTerm.trim().length > 0;
  const isTrulyEmpty =
    entries.length === 0 &&
    !hasSearchFilter &&
    paymentFilter === 'all' &&
    attentionFilter === 'all';
  const emptyStateMessage = getEntryManagementEmptyStateMessage({
    attention: attentionFilter,
    hasSearch: hasSearchFilter,
    payment: paymentFilter,
  });
  const emptyStateContent = (
    <div className="space-y-3">
      <p>{emptyStateMessage}</p>
      {isTrulyEmpty && showId && (
        <Button asChild>
          <Link to={`/secretary/register/${encodeURIComponent(showId)}`}>Add mail-in entry</Link>
        </Button>
      )}
    </div>
  );
  const enrollmentCardList = (
    <div className="space-y-3">
      {enrollmentGroups.length > 0 ? (
        enrollmentGroups.map(group => (
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
          />
        ))
      ) : (
        <div className="rounded-lg border border-dashed border-border/70 bg-card/60 px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyStateContent}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <EntryStatsCards stats={stats} />

      <EntryWorkModeSwitch value={workMode} onChange={handleWorkModeChange} />

      {/* Search, filters, and view mode */}
      <ListControls
        search={searchTerm}
        onSearchChange={setSearchTerm}
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
            setPaymentFilter(value || 'all');
          }
        }}
        viewMode={entryViewMode}
        onViewModeChange={mode => {
          selection.clearSelection();
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

      {entryViewMode === 'table' && isMobileViewport ? (
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
        />
      )}

      {decisionEmailPrompt && (
        <LifecycleEmailPreviewDialog
          key={`${decisionEmailPrompt.entry.id}:${decisionEmailPrompt.stepType}`}
          open={true}
          onOpenChange={open => {
            if (!open) setDecisionEmailPrompt(null);
          }}
          stepType={decisionEmailPrompt.stepType}
          show={{ name: showName ?? 'this show' }}
          recipient={{
            name: decisionEmailPrompt.entry.ownerName,
            email: decisionEmailPrompt.entry.ownerEmail,
          }}
          entry={{
            dogName: decisionEmailPrompt.entry.dogName,
            className: decisionEmailPrompt.entry.classes[0]?.name ?? null,
            armbandNumber: decisionEmailPrompt.entry.armbandNumber ?? null,
            amountDue: Math.max(
              0,
              decisionEmailPrompt.entry.totalFee - decisionEmailPrompt.entry.paidAmount
            ),
          }}
          onNotNow={values => {
            void saveLifecycleEmailJobForLater({
              supabase,
              showId: decisionEmailPrompt.entry.showId,
              stepType: decisionEmailPrompt.stepType,
              recipientScope: 'enrollment',
              entryId: decisionEmailPrompt.entry.id,
              enrollmentId: decisionEmailPrompt.entry.registrationId,
              recipientEmail: decisionEmailPrompt.entry.ownerEmail,
              recipientName: decisionEmailPrompt.entry.ownerName,
              subject: values.subject,
              body: values.body,
              secretaryNote: values.secretaryNote,
              idempotencyKey: buildLifecycleEmailIdempotencyKey({
                showId: decisionEmailPrompt.entry.showId,
                stepType: decisionEmailPrompt.stepType,
                recipientScope: 'enrollment',
                enrollmentId: decisionEmailPrompt.entry.registrationId,
              }),
            })
              .then(() => toast.info('Email ready for later review'))
              .catch(() =>
                toast.error('Entry decision is saved. The email was not saved for later.')
              );
            setDecisionEmailPrompt(null);
          }}
          onSend={async values => {
            await onSendDecisionEmail(
              decisionEmailPrompt.entry.registrationId,
              values.secretaryNote.trim() || values.body.trim(),
              undefined
            );
            setDecisionEmailPrompt(null);
          }}
        />
      )}
    </div>
  );
};

export default RegistrationView;

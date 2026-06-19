import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { MoveUpRequestsTab } from '@/components/entries/MoveUpRequestsTab';
import { PullManagementTab } from '@/components/entries/PullManagementTab';
import { toast } from 'sonner';
import { useEmailStatus } from '@/hooks/useEmailStatus';
import { supabase } from '@/lib/supabase';
import { ListControls } from '@/components/common/ListControls';

import { EntryStatsCards } from './EntryStatsCards';
import { EnrollmentCard } from './EnrollmentCard';
import { EntriesTableView } from './EntriesTableView';
import { EntryBulkActionsBar } from './EntryBulkActionsBar';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import {
  ENTRY_MANAGEMENT_FILTERS,
  ENTRY_VIEW_MODES,
  type EntryAttentionFilter,
  type EntryManagementViewMode,
} from './entryManagementFilters';

import type { EntryManagementEntry, EntryStats, EntryClass } from '@/types/entry-management-types';
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
  /** Entry list view mode */
  entryViewMode: EntryManagementViewMode;
  setEntryViewMode: (view: EntryManagementViewMode) => void;
  /** Tab counts */
  tabCounts: {
    all: number;
    pending: number;
    accepted: number;
    waitlist: number;
    issues: number;
  };
  /** Filtered entries to display */
  filteredEntries: EntryManagementEntry[];
  /** All entries (for looking up entry by id in comp handler) */
  entries: EntryManagementEntry[];
  /** Bulk enrollment-level action handlers */
  onBulkStatusChange: (entryIds: string[], status: EntryStatus) => void;
  onBulkCheckIn: (entryIds: string[]) => void;
  onPaymentStatusChange: (
    enrollmentId: string,
    status: PaymentStatus,
    reference?: string | null,
    paidAmount?: number | null
  ) => void;
  /** Status change handler */
  onStatusChange: (entryId: string, status: EntryStatus) => void;
  /** Check-in inline handler */
  onCheckInStatusChange: (
    entry: EntryManagementEntry,
    cls: EntryClass,
    status: CheckInStatus
  ) => void;
  /** Dialog openers */
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onOpenCompDialog: (entry: EntryManagementEntry) => void;
  onUncompEntry: (entryId: string) => void;
  onRemoveEntry: (entryId: string) => void;
  /** Show ID for move-ups / pulled entries tabs */
  showId: string;
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
  entryViewMode,
  setEntryViewMode,
  filteredEntries,
  entries,
  onBulkStatusChange,
  onBulkCheckIn,
  onPaymentStatusChange,
  onStatusChange,
  onCheckInStatusChange,
  onOpenArmbandDialog,
  onOpenCompDialog,
  onUncompEntry,
  onRemoveEntry,
  showId,
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

  // Email status tracking (self-contained)
  const registrationIds = useMemo(
    () => [...new Set(entries.map(e => e.registrationId).filter(Boolean))],
    [entries]
  );
  const { data: emailStatusMap } = useEmailStatus(registrationIds);

  // Resend cooldown state (registrationId -> cooldown expiry timestamp)
  const [resendCooldowns, setResendCooldowns] = useState<Record<string, number>>({});

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

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <EntryStatsCards stats={stats} />

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
          searchTerm.length > 0 ||
          paymentFilter !== 'all' ||
          attentionFilter !== 'all'
        }
        entityName="entries"
      />

      {attentionFilter === 'move-ups' ? (
        <Card>
          <CardContent className="pt-6">
            <MoveUpRequestsTab showId={showId} onRefresh={onRefresh} />
          </CardContent>
        </Card>
      ) : attentionFilter === 'pulled' ? (
        <Card>
          <CardContent className="pt-6">
            <PullManagementTab showId={showId} onRefresh={onRefresh} />
          </CardContent>
        </Card>
      ) : entryViewMode === 'table' ? (
        <EntriesTableView
          entries={filteredEntries}
          emailStatusMap={emailStatusMap}
          onResendEmail={handleResendEmail}
          isResendDisabled={isResendDisabled}
          onStatusChange={onStatusChange}
          onCheckInEntry={entryId => onBulkCheckIn([entryId])}
          onOpenArmbandDialog={onOpenArmbandDialog}
          onOpenCompDialog={onOpenCompDialog}
          onUncompEntry={onUncompEntry}
          onRemoveEntry={onRemoveEntry}
          selection={tableSelection}
        />
      ) : (
        <div className="space-y-3">
          {enrollmentGroups.map(group => (
            <EnrollmentCard
              key={group.groupKey}
              group={group}
              onStatusChange={onStatusChange}
              onEntryRefunded={onRefresh}
              onCheckInStatusChange={onCheckInStatusChange}
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
          ))}
        </div>
      )}

      {entryViewMode === 'table' &&
        attentionFilter !== 'move-ups' &&
        attentionFilter !== 'pulled' && (
          <EntryBulkActionsBar
            selectedEntries={selection.selectedItems}
            onBulkStatusChange={onBulkStatusChange}
            onBulkCheckIn={onBulkCheckIn}
            onClear={selection.clearSelection}
          />
        )}
    </div>
  );
};

export default RegistrationView;

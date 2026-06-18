import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { ArrowUpCircle, XCircle, List, Table2 } from 'lucide-react';
import { MoveUpRequestsTab } from '@/components/entries/MoveUpRequestsTab';
import { PullManagementTab } from '@/components/entries/PullManagementTab';
import { toast } from 'sonner';
import { useEmailStatus } from '@/hooks/useEmailStatus';
import { supabase } from '@/lib/supabase';

import { EntryStatsCards } from './EntryStatsCards';
import { EntryFiltersCard } from './EntryFiltersCard';
import { EnrollmentCard } from './EnrollmentCard';
import { EntriesTableView } from './EntriesTableView';
import { EntryBulkActionsBar } from './EntryBulkActionsBar';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';

import type {
  EntryManagementEntry,
  EntryStats,
  EntryClass,
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
  /** Tab state */
  selectedTab: string;
  setSelectedTab: (tab: string) => void;
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
  onPaymentStatusChange: (enrollmentId: string, status: PaymentStatus, reference?: string | null, paidAmount?: number | null) => void;
  /** Status change handler */
  onStatusChange: (entryId: string, status: EntryStatus) => void;
  /** Check-in inline handler */
  onCheckInStatusChange: (entry: EntryManagementEntry, cls: EntryClass, status: CheckInStatus) => void;
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
  onSendDecisionEmail: (registrationId: string, message?: string, amountDue?: number) => Promise<void>;
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
  selectedTab,
  setSelectedTab,
  tabCounts,
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
  const [entryViewMode, setEntryViewMode] = useState<'list' | 'table'>('list');

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

  // Clear selection on tab change (avoids carrying a selection into a different
  // status bucket). Done in the handler, not an effect, per the no-setState-in-effect rule.
  const handleTabChange = (tab: string) => {
    selection.clearSelection();
    setSelectedTab(tab);
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

      {/* Filters */}
      <EntryFiltersCard
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        paymentFilter={paymentFilter}
        setPaymentFilter={setPaymentFilter}
      />

      {/* Entries Tabs */}
      <Tabs value={selectedTab} onValueChange={handleTabChange}>
        <div className="flex items-center justify-between gap-4 mb-2">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="all">All ({tabCounts.all})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({tabCounts.pending})</TabsTrigger>
            <TabsTrigger value="accepted">Accepted ({tabCounts.accepted})</TabsTrigger>
            <TabsTrigger value="waitlist">Waitlist ({tabCounts.waitlist})</TabsTrigger>
            <TabsTrigger value="move-ups">
              <ArrowUpCircle className="h-4 w-4 mr-1" />
              Move-Ups
            </TabsTrigger>
            <TabsTrigger value="scratches">
              <XCircle className="h-4 w-4 mr-1" />
              Pulled
            </TabsTrigger>
            <TabsTrigger value="issues">Issues ({tabCounts.issues})</TabsTrigger>
          </TabsList>

          <div className="flex bg-muted/50 rounded-lg p-1 flex-shrink-0">
            <Button
              variant={entryViewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setEntryViewMode('list');
                selection.clearSelection();
              }}
              className="h-8 px-2"
              aria-label="List view"
              aria-pressed={entryViewMode === 'list'}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={entryViewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setEntryViewMode('table')}
              className="h-8 px-2"
              aria-label="Table view"
              aria-pressed={entryViewMode === 'table'}
            >
              <Table2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Catch-all content for the entry-list tabs (all/pending/accepted/
            waitlist/issues): one TabsContent whose value tracks the active tab.
            The Move-Ups and Pulled tabs have their own dedicated content below,
            so this catch-all is suppressed for them — otherwise it rendered the
            full entry list ABOVE the focused request queue, burying the decision
            card (F6b). */}
        {selectedTab !== 'move-ups' && selectedTab !== 'scratches' && (
          <TabsContent value={selectedTab} className="mt-6">
            {entryViewMode === 'table' ? (
              <EntriesTableView
                entries={filteredEntries}
                emailStatusMap={emailStatusMap}
                onResendEmail={handleResendEmail}
                isResendDisabled={isResendDisabled}
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
                    lastDecisionEmailedAt={group.enrollmentId ? lastEmailedMap[group.enrollmentId] : undefined}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* Move-Ups Tab Content */}
        <TabsContent value="move-ups" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <MoveUpRequestsTab showId={showId} onRefresh={onRefresh} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pulled Tab Content */}
        <TabsContent value="scratches" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <PullManagementTab showId={showId} onRefresh={onRefresh} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {entryViewMode === 'table' && (
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

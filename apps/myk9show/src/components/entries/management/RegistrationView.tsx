import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EntryStatus } from '@/types/show-registration-types';
import { ArrowUpCircle, XCircle, CheckCircle2, List, Table2 } from 'lucide-react';
import { MoveUpRequestsTab } from '@/components/entries/MoveUpRequestsTab';
import { ScratchManagementTab } from '@/components/entries/ScratchManagementTab';
import { toast } from 'sonner';
import { useEmailStatus } from '@/hooks/useEmailStatus';
import { supabase } from '@/lib/supabase';

import { EntryStatsCards } from './EntryStatsCards';
import { EntryFiltersCard } from './EntryFiltersCard';
import { EnrollmentCard } from './EnrollmentCard';
import { EntriesTableView } from './EntriesTableView';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';

import type {
  EntryManagementEntry,
  EntryStats,
  EntryClass,
  BulkAction,
  BulkActionDialogState,
} from '@/types/entry-management-types';

interface RegistrationViewProps {
  /** Entry stats for the stats cards */
  stats: EntryStats;
  /** Search term for filtering */
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  /** Status filter */
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  /** Payment filter */
  paymentFilter: string;
  setPaymentFilter: (v: string) => void;
  /** Clear all filters */
  onClearFilters: () => void;
  /** Currently selected entries (for bulk actions) */
  selectedEntries: Set<string>;
  /** Bulk action dialog state */
  bulkActionDialog: BulkActionDialogState;
  setBulkActionDialog: (state: BulkActionDialogState) => void;
  /** Bulk action handler */
  onBulkAction: (action: BulkAction) => void;
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
  /** Selection handlers */
  onSelectEntry: (entryId: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  /** Status change handler */
  onStatusChange: (entryId: string, status: EntryStatus) => void;
  /** Dialog openers */
  onOpenCheckInDialog: (entry: EntryManagementEntry, classEntry: EntryClass) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onOpenCompDialog: (entry: EntryManagementEntry) => void;
  onUncompEntry: (entryId: string) => void;
  /** Show ID for move-ups / scratches tabs */
  showId: string;
  /** Reload entries callback */
  onRefresh: () => void;
  /** Entries grouped by enrollment/order for the list view */
  enrollmentGroups: EnrollmentGroup[];
}

/**
 * Registration view for the Entry Management page.
 * Shows stats, filters, bulk actions, and tabbed entry lists.
 */
export const RegistrationView: React.FC<RegistrationViewProps> = ({
  stats,
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  paymentFilter,
  setPaymentFilter,
  onClearFilters,
  selectedEntries,
  bulkActionDialog,
  setBulkActionDialog,
  onBulkAction,
  selectedTab,
  setSelectedTab,
  tabCounts,
  filteredEntries,
  entries,
  onSelectEntry,
  onSelectAll,
  onStatusChange,
  onOpenCheckInDialog,
  onOpenArmbandDialog,
  onOpenCompDialog,
  onUncompEntry,
  showId,
  onRefresh,
  enrollmentGroups,
}) => {
  const [entryViewMode, setEntryViewMode] = useState<'list' | 'table'>('list');

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
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        paymentFilter={paymentFilter}
        setPaymentFilter={setPaymentFilter}
        onClearFilters={onClearFilters}
      />

      {/* Bulk Actions */}
      {selectedEntries.size > 0 && (
        <Card className="border-border bg-muted">
          <CardContent className="p-4">
            <div className="flex justify-between items-center">
              <span className="font-medium">{selectedEntries.size} entries selected</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => setBulkActionDialog({ open: true, action: 'status_change' })}
                >
                  Change Status
                </Button>
                <Dialog
                  open={bulkActionDialog.open && bulkActionDialog.action === 'status_change'}
                  onOpenChange={open => setBulkActionDialog({ action: 'status_change', open })}
                >
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Bulk Status Change</DialogTitle>
                      <DialogDescription>
                        Change status for {selectedEntries.size} selected entries
                      </DialogDescription>
                    </DialogHeader>
                    <Select
                      onValueChange={value =>
                        onBulkAction({
                          type: 'status_change',
                          data: { status: value },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select new status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EntryStatus.ACCEPTED}>Accept</SelectItem>
                        <SelectItem value={EntryStatus.WAITLIST}>Move to Waitlist</SelectItem>
                        <SelectItem value={EntryStatus.REJECTED}>Reject</SelectItem>
                      </SelectContent>
                    </Select>
                  </DialogContent>
                </Dialog>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkActionDialog({ open: true, action: 'check_in' })}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Bulk Check-In
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entries Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
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
              Scratches
            </TabsTrigger>
            <TabsTrigger value="issues">Issues ({tabCounts.issues})</TabsTrigger>
          </TabsList>

          <div className="flex bg-muted/50 rounded-lg p-1 flex-shrink-0">
            <Button
              variant={entryViewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setEntryViewMode('list')}
              className="h-8 px-2"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={entryViewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setEntryViewMode('table')}
              className="h-8 px-2"
            >
              <Table2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <TabsContent value={selectedTab} className="mt-6">
          {entryViewMode === 'table' ? (
            <EntriesTableView
              entries={filteredEntries}
              emailStatusMap={emailStatusMap}
              onResendEmail={handleResendEmail}
              isResendDisabled={isResendDisabled}
            />
          ) : (
            <div className="space-y-3">
              {enrollmentGroups.map(group => (
                <EnrollmentCard
                  key={group.enrollmentId ?? `__unregistered__:${group.handlerName}`}
                  group={group}
                  onStatusChange={onStatusChange}
                  onOpenCheckInDialog={onOpenCheckInDialog}
                  onOpenArmbandDialog={onOpenArmbandDialog}
                  onCompEntry={(entryId: string) => {
                    const entry = group.entries.find(e => e.id === entryId);
                    if (entry) onOpenCompDialog(entry);
                  }}
                  onUncompEntry={onUncompEntry}
                  selectedEntries={selectedEntries}
                  onSelectEntry={onSelectEntry}
                  onSelectAll={onSelectAll}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Move-Ups Tab Content */}
        <TabsContent value="move-ups" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <MoveUpRequestsTab showId={showId} onRefresh={onRefresh} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scratches Tab Content */}
        <TabsContent value="scratches" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <ScratchManagementTab showId={showId} onRefresh={onRefresh} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RegistrationView;

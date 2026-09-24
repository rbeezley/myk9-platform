/**
 * Pull Management Tab
 *
 * Lists the show's pulled entries and reconciles their refund decisions.
 *
 * There is no approval queue: a pull is the exhibitor's own act and writes
 * `scratched` directly (MYK9-632), so the secretary's job here is the refund
 * decision, not whether the pull may happen (MYK9-609).
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, XCircle, RefreshCw } from 'lucide-react';
import { TableSkeleton } from '@/components/common/SkeletonLoaders';
import { NoPulledEntriesCard, PulledEntriesUnknownCard } from './PullTabStateCards';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { PullReconciliationCard } from './management/PullReconciliationCard';
import { RefundEntryDialog } from './management/RefundEntryDialog';

interface PullManagementTabProps {
  processedEntries: EntryManagementEntry[];
  /**
   * The caller's entries read is still running or failed, so `processedEntries`
   * being empty means NOTHING. Without this the Registrations tab showed an
   * honest "Couldn't load entries" while this tab, fed the same failed read,
   * confidently reported "There are no pulled entries for this show".
   */
  processedEntriesUnknown?: boolean;
  /**
   * The caller's entries read is still IN FLIGHT. Distinct from
   * `processedEntriesUnknown`: nothing has failed, so this must render as
   * pending, not as an error. Folding the two together traded one false claim
   * for another -- a red "Couldn't load this show's entries" every time the
   * secretary opened this tab or hit Refresh.
   */
  processedEntriesLoading?: boolean;
  onRefresh?: () => void;
}

export const PullManagementTab: React.FC<PullManagementTabProps> = ({
  processedEntries,
  processedEntriesUnknown = false,
  processedEntriesLoading = false,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [refundEntry, setRefundEntry] = useState<EntryManagementEntry | null>(null);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredProcessed = normalizedSearch
    ? processedEntries.filter(
        entry =>
          entry.dogName.toLowerCase().includes(normalizedSearch) ||
          entry.handlerName.toLowerCase().includes(normalizedSearch) ||
          entry.classes.some(entryClass => entryClass.name.toLowerCase().includes(normalizedSearch))
      )
    : processedEntries;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <XCircle className="h-5 w-5" aria-hidden />
            Pull Management
          </h2>
          <p className="text-sm text-muted-foreground">
            Pulled entries and their refund decisions, in one place.
          </p>
        </div>
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by dog, handler, or class..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {processedEntriesLoading ? (
        // Section load = table skeleton (previews the pulled-entries list).
        <div role="status" aria-label="Loading pulled entries" className="py-4">
          <TableSkeleton rows={4} columns={4} />
        </div>
      ) : processedEntriesUnknown ? (
        <PulledEntriesUnknownCard />
      ) : filteredProcessed.length === 0 ? (
        <NoPulledEntriesCard searching={Boolean(searchTerm)} />
      ) : (
        <div className="space-y-3">
          {filteredProcessed.map(entry => (
            <PullReconciliationCard
              key={entry.id}
              entry={entry}
              onOpenRefund={setRefundEntry}
              onResolved={() => onRefresh?.()}
            />
          ))}
        </div>
      )}

      <RefundEntryDialog
        open={refundEntry !== null}
        onOpenChange={open => {
          if (!open) setRefundEntry(null);
        }}
        entry={refundEntry}
        onRefunded={() => onRefresh?.()}
      />
    </div>
  );
};

export default PullManagementTab;

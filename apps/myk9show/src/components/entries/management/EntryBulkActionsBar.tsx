/**
 * EntryBulkActionsBar — sticky bottom bar for the Entry Management table multi-select.
 *
 * Operates on the selected entries, applying each action only to the subset it can
 * validly affect (see {@link getEligibleForBulkAction}). Routes to the existing bulk
 * mutation handlers — no new mutation machinery. Mirrors the ResultsControlPage
 * BulkOperationsBar pattern.
 */

import { CheckCircle2, ListPlus, XCircle, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  getEligibleForBulkAction,
  type BulkEntryAction,
} from './bulkActionEligibility';

interface EntryBulkActionsBarProps {
  selectedEntries: EntryManagementEntry[];
  onBulkStatusChange: (entryIds: string[], status: EntryStatus) => void;
  onBulkCheckIn: (entryIds: string[]) => void;
  onClear: () => void;
}

export function EntryBulkActionsBar({
  selectedEntries,
  onBulkStatusChange,
  onBulkCheckIn,
  onClear,
}: EntryBulkActionsBarProps) {
  if (selectedEntries.length === 0) return null;

  const eligibleFor = (action: BulkEntryAction) =>
    getEligibleForBulkAction(selectedEntries, action);

  const runStatus = (action: BulkEntryAction, status: EntryStatus) => {
    const ids = eligibleFor(action).map(e => e.id);
    if (ids.length === 0) return;
    onBulkStatusChange(ids, status);
    onClear();
  };

  const runCheckIn = () => {
    const ids = eligibleFor('check-in').map(e => e.id);
    if (ids.length === 0) return;
    onBulkCheckIn(ids);
    onClear();
  };

  const count = selectedEntries.length;
  const approveCount = eligibleFor('approve').length;
  const waitlistCount = eligibleFor('waitlist').length;
  const rejectCount = eligibleFor('reject').length;
  const checkInCount = eligibleFor('check-in').length;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background p-3 shadow-lg"
      role="region"
      aria-label="Bulk entry actions"
    >
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-medium">
            {count} entr{count === 1 ? 'y' : 'ies'} selected
          </span>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={approveCount === 0}
            onClick={() => runStatus('approve', EntryStatus.ACCEPTED)}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Approve{approveCount > 0 ? ` (${approveCount})` : ''}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={waitlistCount === 0}
            onClick={() => runStatus('waitlist', EntryStatus.WAITLIST)}
          >
            <ListPlus className="mr-2 h-4 w-4" />
            Waitlist{waitlistCount > 0 ? ` (${waitlistCount})` : ''}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={checkInCount === 0}
            onClick={runCheckIn}
          >
            <UserCheck className="mr-2 h-4 w-4" />
            Check In{checkInCount > 0 ? ` (${checkInCount})` : ''}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive focus:text-destructive"
            disabled={rejectCount === 0}
            onClick={() => runStatus('reject', EntryStatus.REJECTED)}
          >
            <XCircle className="mr-2 h-4 w-4" />
            Reject{rejectCount > 0 ? ` (${rejectCount})` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default EntryBulkActionsBar;

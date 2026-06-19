import { CheckCircle2, ClipboardCheck, XCircle } from 'lucide-react';
import { RowActionMenu, type RowAction } from '@/components/ui/RowActionMenu';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { getEligibleForBulkAction, type BulkEntryAction } from './bulkActionEligibility';

type BulkActionResult = boolean | void;

interface EntryBulkActionMenuProps {
  selectedEntries: EntryManagementEntry[];
  onBulkStatusChange: (
    entryIds: string[],
    status: EntryStatus
  ) => BulkActionResult | Promise<BulkActionResult>;
  onBulkCheckIn: (entryIds: string[]) => BulkActionResult | Promise<BulkActionResult>;
  onClear: () => void;
}

export function EntryBulkActionMenu({
  selectedEntries,
  onBulkStatusChange,
  onBulkCheckIn,
  onClear,
}: EntryBulkActionMenuProps) {
  const eligibleFor = (action: BulkEntryAction) =>
    getEligibleForBulkAction(selectedEntries, action);

  const clearWhenSuccessful = (result: BulkActionResult) => {
    if (result !== false) onClear();
  };

  const runStatus = async (action: BulkEntryAction, status: EntryStatus) => {
    const ids = eligibleFor(action).map(entry => entry.id);
    if (ids.length === 0) return;
    try {
      const result = await onBulkStatusChange(ids, status);
      clearWhenSuccessful(result);
    } catch {
      // Parent action handlers own user-visible error copy; keeping selection enables retry.
    }
  };

  const runCheckIn = async () => {
    const ids = eligibleFor('check-in').map(entry => entry.id);
    if (ids.length === 0) return;
    try {
      const result = await onBulkCheckIn(ids);
      clearWhenSuccessful(result);
    } catch {
      // Parent action handlers own user-visible error copy; keeping selection enables retry.
    }
  };

  const approveCount = eligibleFor('approve').length;
  const rejectCount = eligibleFor('reject').length;
  const checkInCount = eligibleFor('check-in').length;

  const actions: RowAction[] = [
    {
      id: 'accept-selected',
      label: approveCount > 0 ? `Accept selected (${approveCount})` : 'Accept selected',
      icon: <CheckCircle2 className="h-4 w-4" />,
      onSelect: () => runStatus('approve', EntryStatus.ACCEPTED),
      disabled: approveCount === 0,
      description: approveCount === 0 ? 'No selected entries can be accepted' : undefined,
    },
    {
      id: 'check-in-selected',
      label: checkInCount > 0 ? `Check in selected (${checkInCount})` : 'Check in selected',
      icon: <ClipboardCheck className="h-4 w-4" />,
      onSelect: runCheckIn,
      disabled: checkInCount === 0,
      description: checkInCount === 0 ? 'Only accepted entries can be checked in' : undefined,
    },
    {
      id: 'reject-selected',
      label: rejectCount > 0 ? `Reject selected (${rejectCount})` : 'Reject selected',
      icon: <XCircle className="h-4 w-4" />,
      onSelect: () => runStatus('reject', EntryStatus.REJECTED),
      disabled: rejectCount === 0,
      description: rejectCount === 0 ? 'No selected entries can be rejected' : undefined,
      variant: 'destructive',
    },
  ];

  return <RowActionMenu actions={actions} size="touch" label="Bulk actions" />;
}

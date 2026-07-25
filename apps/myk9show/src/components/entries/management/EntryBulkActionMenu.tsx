import { RowActionMenu, type RowAction } from '@/components/ui/RowActionMenu';
import type { EntryStatus } from '@/types/show-registration-types';
import type { BulkActionResult, EntryManagementEntry } from '@/types/entry-management-types';
import { getEntryBulkActions } from './entryBulkActions';

interface EntryBulkActionMenuProps {
  selectedEntries: EntryManagementEntry[];
  onBulkStatusChange: (
    entryIds: string[],
    status: EntryStatus,
    onFullSuccess?: () => void
  ) => BulkActionResult | Promise<BulkActionResult>;
  onBulkCheckIn: (
    entryIds: string[],
    onFullSuccess?: () => void
  ) => BulkActionResult | Promise<BulkActionResult>;
  onClear: () => void;
  /** Disable the menu while a bulk batch is in flight (spec: controls disabled until settle). */
  disabled?: boolean;
  actions?: RowAction[];
}

export function EntryBulkActionMenu({
  selectedEntries,
  onBulkStatusChange,
  onBulkCheckIn,
  onClear,
  disabled = false,
  actions,
}: EntryBulkActionMenuProps) {
  const resolvedActions =
    actions ?? getEntryBulkActions(selectedEntries, onBulkStatusChange, onBulkCheckIn, onClear);

  return (
    <RowActionMenu
      actions={resolvedActions}
      size="touch"
      label="Bulk actions"
      disabled={disabled}
    />
  );
}

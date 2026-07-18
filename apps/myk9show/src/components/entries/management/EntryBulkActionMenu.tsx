import { RowActionMenu, toBulkActions } from '@/components/ui/RowActionMenu';
import type { EntryStatus } from '@/types/show-registration-types';
import type { BulkActionResult, EntryManagementEntry } from '@/types/entry-management-types';
import { entryActions } from './entryActions';

interface EntryBulkActionMenuProps {
  selectedEntries: EntryManagementEntry[];
  onBulkStatusChange: (
    entryIds: string[],
    status: EntryStatus
  ) => BulkActionResult | Promise<BulkActionResult>;
  onBulkCheckIn: (entryIds: string[]) => BulkActionResult | Promise<BulkActionResult>;
  onClear: () => void;
  /** Disable the menu while a bulk batch is in flight (spec: controls disabled until settle). */
  disabled?: boolean;
}

export function EntryBulkActionMenu({
  selectedEntries,
  onBulkStatusChange,
  onBulkCheckIn,
  onClear,
  disabled = false,
}: EntryBulkActionMenuProps) {
  const actions = toBulkActions(
    selectedEntries,
    { onBulkStatusChange, onBulkCheckIn, onClear },
    entryActions
  );

  return <RowActionMenu actions={actions} size="touch" label="Bulk actions" disabled={disabled} />;
}

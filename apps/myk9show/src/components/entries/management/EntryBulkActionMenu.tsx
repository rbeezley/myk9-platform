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
}

export function EntryBulkActionMenu({
  selectedEntries,
  onBulkStatusChange,
  onBulkCheckIn,
  onClear,
}: EntryBulkActionMenuProps) {
  const actions = toBulkActions(
    selectedEntries,
    { onBulkStatusChange, onBulkCheckIn, onClear },
    entryActions
  );

  return <RowActionMenu actions={actions} size="touch" label="Bulk actions" />;
}

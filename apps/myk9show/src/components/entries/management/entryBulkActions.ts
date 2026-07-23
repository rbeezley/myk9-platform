import { toBulkActions, type RowAction } from '@/components/ui/RowActionMenu';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { entryActions, type EntryActionHandlers } from './entryActions';

type BulkStatusChange = NonNullable<EntryActionHandlers['onBulkStatusChange']>;
type BulkCheckIn = NonNullable<EntryActionHandlers['onBulkCheckIn']>;

export function getEntryBulkActions(
  selectedEntries: EntryManagementEntry[],
  onBulkStatusChange: BulkStatusChange,
  onBulkCheckIn: BulkCheckIn,
  onClear: () => void
): RowAction[] {
  return toBulkActions(
    selectedEntries,
    { onBulkStatusChange, onBulkCheckIn, onClear },
    entryActions
  );
}

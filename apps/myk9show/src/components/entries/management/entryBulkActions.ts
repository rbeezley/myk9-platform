import { toBulkActions, type RowAction } from '@/components/ui/RowActionMenu';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { entryActions, type EntryActionHandlers } from './entryActions';

type BulkStatusChange = NonNullable<EntryActionHandlers['onBulkStatusChange']>;

export function getEntryBulkActions(
  selectedEntries: EntryManagementEntry[],
  onBulkStatusChange: BulkStatusChange,
  onClear: () => void
): RowAction[] {
  return toBulkActions(
    selectedEntries,
    { onBulkStatusChange, onClear },
    entryActions
  );
}

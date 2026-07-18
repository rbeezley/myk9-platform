import { RowActionMenu, toRowActions } from '@/components/ui/RowActionMenu';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { entryActions, type EntryActionHandlers } from './entryActions';

export interface EntryRowActionMenuProps extends Omit<
  EntryActionHandlers,
  'onBulkStatusChange' | 'onBulkCheckIn' | 'onClear'
> {
  entry: EntryManagementEntry;
}

export function EntryRowActionMenu({ entry, ...handlers }: EntryRowActionMenuProps) {
  const actions = toRowActions(entry, handlers, entryActions);

  return <RowActionMenu actions={actions} size="sm" label={`Actions for ${entry.dogName}`} />;
}

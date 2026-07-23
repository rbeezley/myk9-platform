import { RowActionMenu, toRowActions } from '@/components/ui/RowActionMenu';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { entryActions, type EntryActionHandlers } from './entryActions';
import { useScoredRevertGuard } from './useScoredRevertGuard';

export interface EntryRowActionMenuProps extends Omit<
  EntryActionHandlers,
  'onBulkStatusChange' | 'onBulkCheckIn' | 'onClear'
> {
  entry: EntryManagementEntry;
}

export function EntryRowActionMenu({ entry, ...handlers }: EntryRowActionMenuProps) {
  // Same revert-confirmation guard the status popover uses (see
  // useScoredRevertGuard) — the row menu offers the same statusTarget
  // actions and must not bypass the Completed-entry confirmation.
  const { guardedOnStatusChange, dialog } = useScoredRevertGuard(
    entry.entryStatus,
    handlers.onStatusChange
  );
  const guardedHandlers: EntryActionHandlers = handlers.onStatusChange
    ? { ...handlers, onStatusChange: guardedOnStatusChange }
    : handlers;
  const actions = toRowActions(entry, guardedHandlers, entryActions);

  return (
    <>
      <RowActionMenu actions={actions} size="sm" label={`Actions for ${entry.dogName}`} />
      {dialog}
    </>
  );
}

import { RowActionMenu, toRowActions } from '@/components/ui/RowActionMenu';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { entryActions, type EntryActionHandlers } from './entryActions';
import { isPullBlockedByResult, pullBlockedByResultNote } from './checkInDesk/deskEditable';
import { usePullAwareStatusChange } from './entryPull';
import { useScoredRevertGuard } from './useScoredRevertGuard';

export interface EntryRowActionMenuProps extends Omit<
  EntryActionHandlers,
  'onBulkStatusChange' | 'onClear'
> {
  entry: EntryManagementEntry;
}

export function EntryRowActionMenu({ entry, ...handlers }: EntryRowActionMenuProps) {
  // Same revert-confirmation guard the status popover uses (see
  // useScoredRevertGuard) — the row menu offers the same statusTarget
  // actions and must not bypass the Completed-entry confirmation.
  const pullAwareStatusChange = usePullAwareStatusChange(entry, handlers.onStatusChange);
  const { guardedOnStatusChange, dialog } = useScoredRevertGuard(
    entry.entryStatus,
    { isScored: entry.isScored, resultStatus: entry.resultStatus },
    pullAwareStatusChange
  );
  const guardedHandlers: EntryActionHandlers = handlers.onStatusChange
    ? { ...handlers, onStatusChange: guardedOnStatusChange }
    : handlers;
  // A dog with a result is not pulled (MYK9-1990): the Pull row stays, disabled, and says why.
  const actions = toRowActions(entry, guardedHandlers, entryActions).map(action =>
    action.id === 'pull' && handlers.onStatusChange && isPullBlockedByResult(entry)
      ? {
          ...action,
          hidden: false,
          disabled: true,
          description: pullBlockedByResultNote(
            entry.dogName,
            entry.classes[0]?.name ?? 'this class'
          ),
        }
      : action
  );

  return (
    <>
      <RowActionMenu actions={actions} size="touch" label={`Actions for ${entry.dogName}`} />
      {dialog}
    </>
  );
}

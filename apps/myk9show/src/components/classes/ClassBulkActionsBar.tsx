/**
 * ClassBulkActionsBar — Class Management's multi-select bar, on the shared
 * list-toolkit `FloatingBulkBar` (MYK9-811) instead of a bespoke fixed
 * bottom-0 div — consistent floating position/styling with every other kit
 * surface, and its own in-flow spacer replaces `useRegisterActionBar`'s
 * measured height.
 *
 * Renders the shared class action catalog (`classActions.ts`) via
 * `RowActionMenu`/`toBulkActions` as the bar's one child, the same pattern the
 * admin Users bar uses for its "More" dropdown — the status catalog is a
 * dynamic, per-status-value list, too many entries for individual
 * `BulkBarButton`s. Bulk status change (MYK9-59) dispatches directly through
 * `onBulkStatusChange` — `classActions.ts`'s `runBulkAndClear` clears the
 * selection only when the handler resolves to something other than `false`,
 * i.e. only on full success, same as bulk delete's post-confirm clear. Bulk
 * delete stays destructive and keeps a confirmation dialog (design.md
 * decision D3/D6).
 */
import { useState } from 'react';
import { RowActionMenu, toBulkActions } from '@/components/ui/RowActionMenu';
import { DeleteConfirmationDialog } from '@/components/base';
import { FloatingBulkBar } from '@/components/list-toolkit';
import { classActions, type ClassActionItem, type ClassActionHandlers } from './classActions';

const CLASS_NOUN = ['class', 'classes'] as const;

interface ClassBulkActionsBarProps {
  selectedClasses: ClassActionItem[];
  bulkBusy: boolean;
  onBulkDelete: (classIds: string[], onFullSuccess?: () => void) => Promise<boolean>;
  onBulkStatusChange: (
    classIds: string[],
    status: string,
    onFullSuccess?: () => void
  ) => Promise<boolean>;
  onClear: () => void;
}

export function ClassBulkActionsBar({
  selectedClasses,
  bulkBusy,
  onBulkDelete,
  onBulkStatusChange,
  onClear,
}: ClassBulkActionsBarProps) {
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);

  if (selectedClasses.length === 0) return null;

  const handlers: ClassActionHandlers = {
    // Return `false` (not `undefined`) — the resolver's runBulkAndClear clears the
    // selection on any non-`false` result, but opening the confirm dialog isn't the
    // delete itself. The real clear happens after `onBulkDelete` runs on confirm.
    onBulkDelete: eligibleIds => {
      setConfirmDeleteIds(eligibleIds);
      return false;
    },
    // No confirm dialog for status. `onFullSuccess` (from runBulkAndClear) is
    // threaded into the dispatcher so BOTH an initially-full success and a
    // later "Retry failed" toast success clear the selection; runBulkAndClear's
    // `cleared` latch prevents a double clear on the initial-success path.
    onBulkStatusChange: (classIds, status, onFullSuccess) =>
      onBulkStatusChange(classIds, status, onFullSuccess),
    onClear,
  };

  const actions = toBulkActions(selectedClasses, handlers, classActions).map(action =>
    bulkBusy ? { ...action, disabled: true } : action
  );

  return (
    <>
      <FloatingBulkBar
        count={selectedClasses.length}
        noun={CLASS_NOUN}
        onClear={onClear}
        busy={bulkBusy}
      >
        <RowActionMenu
          actions={actions}
          size="touch"
          label="Bulk class actions"
          disabled={bulkBusy}
        />
      </FloatingBulkBar>

      <DeleteConfirmationDialog
        open={confirmDeleteIds !== null}
        onOpenChange={open => {
          if (!open) setConfirmDeleteIds(null);
        }}
        onConfirm={() => {
          const ids = confirmDeleteIds ?? [];
          setConfirmDeleteIds(null);
          void onBulkDelete(ids, onClear);
        }}
        entityName={`${confirmDeleteIds?.length ?? 0} class${(confirmDeleteIds?.length ?? 0) === 1 ? '' : 'es'}`}
        entityType="Class"
        isDeleting={bulkBusy}
      />
    </>
  );
}

export default ClassBulkActionsBar;

/**
 * ClassBulkActionsBar — sticky bar for Class Management's multi-select.
 *
 * Renders the shared class action catalog (`classActions.ts`) via
 * `RowActionMenu`/`toBulkActions`. Bulk status change (MYK9-59) dispatches
 * directly through `onBulkStatusChange` — `classActions.ts`'s `runBulkAndClear`
 * clears the selection only when the handler resolves to something other than
 * `false`, i.e. only on full success, same as bulk delete's post-confirm clear.
 * Bulk delete stays destructive and keeps a confirmation dialog (design.md
 * decision D3/D6).
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RowActionMenu, toBulkActions } from '@/components/ui/RowActionMenu';
import { DeleteConfirmationDialog } from '@/components/base';
import { classActions, type ClassActionItem, type ClassActionHandlers } from './classActions';

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

  const count = selectedClasses.length;

  const handlers: ClassActionHandlers = {
    // Return `false` (not `undefined`) — the resolver's runBulkAndClear clears the
    // selection on any non-`false` result, but opening the confirm dialog isn't the
    // delete itself. The real clear happens after `onBulkDelete` runs on confirm.
    onBulkDelete: eligibleIds => {
      setConfirmDeleteIds(eligibleIds);
      return false;
    },
    // No confirm dialog for status: the resolved boolean (true only on full
    // success) IS the signal `runBulkAndClear` uses to clear the selection.
    onBulkStatusChange: (classIds, status) => onBulkStatusChange(classIds, status),
    onClear,
  };

  const actions = toBulkActions(selectedClasses, handlers, classActions).map(action =>
    bulkBusy ? { ...action, disabled: true } : action
  );

  return (
    <>
      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background p-3 shadow-lg"
        role="region"
        aria-label="Bulk class actions"
      >
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-medium">
              {count} class{count !== 1 ? 'es' : ''} selected
            </span>
            <Button variant="ghost" size="sm" onClick={onClear} disabled={bulkBusy}>
              Clear
            </Button>
          </div>
          <RowActionMenu
            actions={actions}
            size="touch"
            label="Bulk class actions"
            disabled={bulkBusy}
          />
        </div>
      </div>

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

/**
 * ClassBulkActionsBar — Setup → Classes' multi-select bar, on the shared
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
 * i.e. only on full success. Bulk delete opens the shared `DeleteObjectDialog`
 * (counts, blockers, Undo) and clears the selection once the delete lands.
 */
import { useState } from 'react';
import { RowActionMenu, toBulkActions } from '@/components/ui/RowActionMenu';
import { FloatingBulkBar } from '@/components/list-toolkit';
import { DeleteObjectDialog, classDeleteDetail, type DeleteTargetContext } from '@/features/delete';
import { classActions, type ClassActionItem, type ClassActionHandlers } from './classActions';

const CLASS_NOUN = ['class', 'classes'] as const;

/** A selected class, with what the delete dialog names it by when the page knows it. */
export type ClassBarItem = ClassActionItem & {
  /** The class's own trial, so Undo re-syncs the right trial even when the selection spans trials. */
  trialId?: string | undefined;
  level?: string | null | undefined;
  element?: string | null | undefined;
  trialLabel?: string | undefined;
};

interface ClassBulkActionsBarProps {
  selectedClasses: ClassBarItem[];
  bulkBusy: boolean;
  onBulkStatusChange: (
    classIds: string[],
    status: string,
    onFullSuccess?: () => void
  ) => Promise<boolean>;
  onClear: () => void;
  /** Fallback trial label for classes that carry none of their own. */
  trialLabel?: string | undefined;
  /** Where the classes sit, for the delete's refresh and its Withdraw / Pull link. */
  context?: DeleteTargetContext | undefined;
}

export function ClassBulkActionsBar({
  selectedClasses,
  bulkBusy,
  onBulkStatusChange,
  onClear,
  trialLabel,
  context,
}: ClassBulkActionsBarProps) {
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);

  if (selectedClasses.length === 0) return null;

  const handlers: ClassActionHandlers = {
    // Return `false` (not `undefined`) — the resolver's runBulkAndClear clears the
    // selection on any non-`false` result, but opening the confirm dialog isn't the
    // delete itself. The real clear happens once the shared dialog's delete lands.
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

      {confirmDeleteIds !== null && (
        <DeleteObjectDialog
          open
          onOpenChange={open => {
            if (!open) setConfirmDeleteIds(null);
          }}
          kind="class"
          targets={selectedClasses
            .filter(cls => confirmDeleteIds.includes(cls.id))
            .map(cls => {
              const detail =
                classDeleteDetail({
                  level: cls.level,
                  element: cls.element,
                  trialLabel: cls.trialLabel || trialLabel,
                }) ?? trialLabel;
              return {
                id: cls.id,
                name: cls.name || 'Untitled class',
                ...(detail ? { detail } : {}),
                context: {
                  ...context,
                  ...(cls.trialId ? { trialId: cls.trialId } : {}),
                  classId: cls.id,
                },
              };
            })}
          onDeleted={() => onClear()}
        />
      )}
    </>
  );
}

export default ClassBulkActionsBar;

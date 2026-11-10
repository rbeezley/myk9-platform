/**
 * ClassBulkActionsBar — Select classes' multi-select bar (the show home's schedule), on the shared
 * list-toolkit `FloatingBulkBar` (MYK9-811) instead of a bespoke fixed
 * bottom-0 div — consistent floating position/styling with every other kit
 * surface, and its own in-flow spacer replaces `useRegisterActionBar`'s
 * measured height.
 *
 * Renders the shared class action catalog (`classActions.ts`) via `toBulkActions` as named
 * buttons (MYK9-929): the status catalog is a dynamic, per-status-value list, so it sits under
 * one named "Change status" menu; Export and Delete are their own buttons. Bulk status change
 * (MYK9-59) dispatches directly through
 * `onBulkStatusChange` — `classActions.ts`'s `runBulkAndClear` clears the
 * selection only when the handler resolves to something other than `false`,
 * i.e. only on full success. Bulk delete opens the shared `DeleteObjectDialog`
 * (counts, blockers, Undo) and clears the selection once the delete lands.
 */
import { useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { CLASS_STATUS } from '@myk9/core';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { toBulkActions } from '@/components/ui/RowActionMenu';
import { BulkBarActions, BulkBarButton, FloatingBulkBar } from '@/components/list-toolkit';
import { exportRowsCsv } from '@/utils/downloadCsv';
import { CLASS_EXPORT_HEADERS, classExportRows } from './classesExport';
import { DeleteObjectDialog, classDeleteDetail, type DeleteTargetContext } from '@/features/delete';
import { classActions, type ClassActionItem, type ClassActionHandlers } from './classActions';

const CLASS_NOUN = ['class', 'classes'] as const;

/** A selected class, with what the delete dialog names it by when the page knows it. */
export type ClassBarItem = ClassActionItem & {
  /** The class's own trial, so Undo re-syncs the right trial even when the selection spans trials. */
  trialId?: string | undefined;
  level?: string | null | undefined;
  element?: string | null | undefined;
  section?: string | null | undefined;
  judgeName?: string | null | undefined;
  entryCount?: number | null | undefined;
  time?: string | null | undefined;
  ring?: number | string | null | undefined;
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
  /** More bar controls, before Change status, e.g. the show home's Assign judge (MYK9-1324). */
  extraActions?: ReactNode;
}

export function ClassBulkActionsBar({
  selectedClasses,
  bulkBusy,
  onBulkStatusChange,
  onClear,
  trialLabel,
  context,
  extraActions,
}: ClassBulkActionsBarProps) {
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);
  const [pendingCancel, setPendingCancel] = useState<{
    classIds: string[];
    onFullSuccess: (() => void) | undefined;
  } | null>(null);

  if (selectedClasses.length === 0) return null;

  const handlers: ClassActionHandlers = {
    // Return `false` (not `undefined`) — the resolver's runBulkAndClear clears the
    // selection on any non-`false` result, but opening the confirm dialog isn't the
    // delete itself. The real clear happens once the shared dialog's delete lands.
    onBulkDelete: eligibleIds => {
      setConfirmDeleteIds(eligibleIds);
      return false;
    },
    // Routine statuses apply at once; Cancelled asks once for the whole batch (below) and
    // returns `false` so the selection stays until the confirmed run lands. `onFullSuccess` (from runBulkAndClear) is
    // threaded into the dispatcher so BOTH an initially-full success and a
    // later "Retry failed" toast success clear the selection; runBulkAndClear's
    // `cleared` latch prevents a double clear on the initial-success path.
    onBulkStatusChange: (classIds, status, onFullSuccess) => {
      if (status === CLASS_STATUS.CANCELLED) {
        setPendingCancel({ classIds, onFullSuccess });
        return Promise.resolve(false);
      }
      return onBulkStatusChange(classIds, status, onFullSuccess);
    },
    onClear,
  };

  const actions = toBulkActions(selectedClasses, handlers, classActions).map(action =>
    bulkBusy ? { ...action, disabled: true } : action
  );

  const handleExport = () =>
    exportRowsCsv(
      'classes',
      CLASS_EXPORT_HEADERS,
      classExportRows(
        selectedClasses.map(cls => ({ ...cls, trialLabel: cls.trialLabel || trialLabel }))
      )
    );

  return (
    <>
      <FloatingBulkBar
        count={selectedClasses.length}
        noun={CLASS_NOUN}
        onClear={onClear}
        busy={bulkBusy}
      >
        {extraActions}
        <BulkBarActions actions={actions} menuLabel="Change status" disabled={bulkBusy} />
        <BulkBarButton
          onClick={handleExport}
          icon={<Download className="h-4 w-4" aria-hidden="true" />}
          disabled={bulkBusy}
        >
          Export
        </BulkBarButton>
      </FloatingBulkBar>

      <ConfirmDialog
        open={pendingCancel !== null}
        onOpenChange={open => !open && setPendingCancel(null)}
        title={
          pendingCancel?.classIds.length === 1
            ? 'Cancel this class?'
            : `Cancel ${pendingCancel?.classIds.length ?? 0} classes?`
        }
        description={`${pendingCancel?.classIds.length === 1 ? 'This class' : 'These classes'} will show as cancelled to exhibitors and at ringside. You can change the status back later.`}
        confirmLabel={pendingCancel?.classIds.length === 1 ? 'Cancel class' : 'Cancel classes'}
        cancelLabel="Keep classes"
        destructive
        onConfirm={() => {
          if (!pendingCancel) return;
          void onBulkStatusChange(
            pendingCancel.classIds,
            CLASS_STATUS.CANCELLED,
            pendingCancel.onFullSuccess
          );
        }}
      />

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

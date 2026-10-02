/**
 * The ONE delete confirmation for clubs, shows, trials, classes, entries, dogs
 * and people (CRUD standard Phase 2, docs/plan-crud-standard.md).
 *
 * It always asks first, says what goes with the item (counts from the server),
 * refuses up front when the server would refuse (paid or scored work, a club
 * with shows, a person who owns dogs) and points at the allowed path, and keeps
 * Delete off while the counts are unknown. On Delete it runs the one delete
 * service (`deleteRecords`), drops the item from this device, and offers Undo
 * to the person who deleted.
 *
 * INTENT: no surface deletes without this dialog. A caller only decides WHEN to
 * open it and what to do after (navigate away, clear a selection).
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@/lib/notifications';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { useShowStore } from '@/store/showStore';
import { ForceDeleteOverride } from '@/components/dogs/common/ForceDeleteOverride';
import { alreadyDeletedToast, partialFailureMessage } from './deleteObjectCopy';
import { deleteRecords, invalidateAfterDelete, type DeleteRecordsResult } from './deleteRecords';
import { offerUndoToast } from './deleteUndoToast';
import { DeleteObjectDialogView, type DeleteBlockedAction } from './DeleteObjectDialogView';
import { useDeletePreview } from './useDeletePreview';
import { splitAlreadyGone, useReconcileAlreadyGone } from './useAlreadyGoneTargets';
import type { DeleteObjectKind, DeleteTarget } from './deleteTypes';

export interface DeleteObjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: DeleteObjectKind;
  targets: readonly DeleteTarget[];
  /**
   * After the delete: at least one item is gone (deleted now, or already
   * deleted elsewhere). Navigate away or clear a selection here.
   */
  onDeleted?: ((result: DeleteRecordsResult) => void) | undefined;
  /** After Undo brought items back. */
  onRestored?: ((restored: DeleteTarget[]) => void) | undefined;
  /** Delete was pressed and the server call is starting. */
  onDeleteStart?: (() => void) | undefined;
  /** Nothing was deleted (refused or failed); the dialog stays open with the reason. */
  onDeleteFailed?: (() => void) | undefined;
}

/** Where a blocked delete points: Cancel show, or Withdraw / Pull on the entries page. */
function blockedActionFor(
  kind: DeleteObjectKind,
  targets: readonly DeleteTarget[]
): DeleteBlockedAction | undefined {
  const first = targets[0];
  if (!first || targets.length !== 1) return undefined;
  if (kind === 'show') {
    // The Cancel show control lives on Show Settings, which acts on the selected show.
    return {
      to: '/secretary/settings',
      onNavigate: () => useShowStore.getState().selectShow(first.id),
    };
  }
  const showId = first.context?.showId;
  if ((kind === 'trial' || kind === 'class' || kind === 'entry') && showId) {
    return { to: `/shows/${showId}/entries` };
  }
  return undefined;
}

export function DeleteObjectDialog({
  open,
  onOpenChange,
  kind,
  targets,
  onDeleted,
  onRestored,
  onDeleteStart,
  onDeleteFailed,
}: DeleteObjectDialogProps) {
  const queryClient = useQueryClient();
  const { hasRole } = useAuthContext();
  const ids = targets.map(target => target.id);
  const { state, perItem, goneIds, retry } = useDeletePreview(kind, ids, open);
  // An item another device already deleted (the preview's P0002) leaves the
  // delete, and this device, instead of blocking the rest of the selection.
  const { liveTargets, goneTargets } = splitAlreadyGone(targets, goneIds);
  const livePerItem = perItem.filter((_, index) => !goneIds.includes(ids[index] ?? ''));
  // Everything was already gone: keep naming the items, with Delete off, while
  // this device catches up and the dialog closes.
  const allGone = targets.length > 0 && liveTargets.length === 0;
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Re-arms by mounting: callers render this only while open, so every open
  // starts unticked (same rule as DeleteDogDialog, MYK9-600).
  const [overrideArmed, setOverrideArmed] = useState(false);

  // Only the dog keeps an in-dialog admin override today (force_delete_dog,
  // MYK9-596). The other guarded objects point at Cancel / Withdraw / Pull.
  const allowOverride = kind === 'dog' && hasRole(UserRole.SITE_ADMIN);

  const close = () => {
    setErrorMessage(null);
    onOpenChange(false);
  };

  useReconcileAlreadyGone(kind, targets, goneTargets, gone => {
    notifications.info(alreadyDeletedToast(kind, gone));
    close();
    onDeleted?.({ deleted: [], alreadyGone: gone, failed: [], deletedAt: Date.now() });
  });

  const handleConfirm = async () => {
    setIsDeleting(true);
    setErrorMessage(null);
    onDeleteStart?.();
    let result: DeleteRecordsResult;
    try {
      result = await deleteRecords(kind, liveTargets, {
        override: allowOverride && overrideArmed,
      });
      // The preview's already-gone items are gone too, for the caller's selection.
      result = { ...result, alreadyGone: [...goneTargets, ...result.alreadyGone] };
    } catch {
      // deleteRecords maps every failure itself; this is only a guard.
      setIsDeleting(false);
      setErrorMessage('Something went wrong. Please try again.');
      onDeleteFailed?.();
      return;
    }
    setIsDeleting(false);
    invalidateAfterDelete(queryClient, kind);

    const gone = result.deleted.length + result.alreadyGone.length;
    if (gone === 0) {
      // Nothing went: stay open and say why, where the user is looking. In a bulk
      // delete, name the item the reason is about.
      const first = result.failed[0];
      setErrorMessage(
        first
          ? liveTargets.length > 1
            ? `${first.target.name}: ${first.message}`
            : first.message
          : null
      );
      onDeleteFailed?.();
      return;
    }

    offerUndoToast({
      kind,
      deleted: result.deleted,
      deletedAt: result.deletedAt,
      queryClient,
      onRestored,
    });
    if (result.failed.length > 0) {
      notifications.error(partialFailureMessage(kind, result.failed.length, liveTargets.length), {
        description: result.failed[0]?.message,
      });
    }
    close();
    onDeleted?.(result);
  };

  return (
    <DeleteObjectDialogView
      open={open}
      onCancel={close}
      onConfirm={() => void handleConfirm()}
      kind={kind}
      targets={allGone ? targets : liveTargets}
      previewState={allGone ? { status: 'pending' } : state}
      perItem={livePerItem}
      onRetry={retry}
      isDeleting={isDeleting}
      errorMessage={errorMessage}
      blockedAction={blockedActionFor(kind, liveTargets)}
      overrideArmed={overrideArmed}
      {...(allowOverride
        ? {
            overrideControl: (
              <ForceDeleteOverride
                checked={overrideArmed}
                onCheckedChange={setOverrideArmed}
                disabled={isDeleting}
              />
            ),
          }
        : {})}
    />
  );
}

export default DeleteObjectDialog;

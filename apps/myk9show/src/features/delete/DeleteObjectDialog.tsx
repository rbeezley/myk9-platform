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
import { partialFailureMessage } from './deleteObjectCopy';
import { deleteRecords, invalidateAfterDelete, type DeleteRecordsResult } from './deleteRecords';
import { offerUndoToast } from './deleteUndoToast';
import { DeleteObjectDialogView, type DeleteBlockedAction } from './DeleteObjectDialogView';
import { useDeletePreview } from './useDeletePreview';
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
  const { state, perItem, retry } = useDeletePreview(kind, ids, open);
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

  const handleConfirm = async () => {
    setIsDeleting(true);
    setErrorMessage(null);
    onDeleteStart?.();
    let result: DeleteRecordsResult;
    try {
      result = await deleteRecords(kind, targets, { override: allowOverride && overrideArmed });
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
          ? targets.length > 1
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
      notifications.error(partialFailureMessage(kind, result.failed.length, targets.length), {
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
      targets={targets}
      previewState={state}
      perItem={perItem}
      onRetry={retry}
      isDeleting={isDeleting}
      errorMessage={errorMessage}
      blockedAction={blockedActionFor(kind, targets)}
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

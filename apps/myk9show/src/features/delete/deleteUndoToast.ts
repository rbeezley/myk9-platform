/**
 * The confirmation toast after a delete, with Undo for the person who deleted.
 *
 * Only the deleter ever sees it: it is raised in the session that ran the
 * delete. It is offered only while the server's 10-minute window is open: the
 * button re-checks the clock when pressed and, once the window has closed, says
 * who can restore instead of calling a restore the server would refuse. The
 * server is the real gate (restore_* admits the deleter for 10 minutes, then a
 * site admin only).
 */
import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { showUndoToast } from '@/lib/undoToast';
import { deletedToast, restoredToast, undoExpiredMessage } from './deleteObjectCopy';
import { canStillUndo, invalidateAfterDelete, restoreRecords } from './deleteRecords';
import { UNDO_WINDOW_MS, type DeleteObjectKind, type DeleteTarget } from './deleteTypes';

/** How long the toast stays up. The Undo window itself is the server's 10 minutes. */
export const DELETE_TOAST_MS = 15_000;

export interface OfferUndoParams {
  kind: DeleteObjectKind;
  deleted: readonly DeleteTarget[];
  deletedAt: number;
  queryClient: QueryClient;
  /** Called once Undo has brought at least one item back. */
  onRestored?: ((restored: DeleteTarget[]) => void) | undefined;
  /** Test seam for the clock. */
  now?: () => number;
}

export async function undoDelete({
  kind,
  deleted,
  deletedAt,
  queryClient,
  onRestored,
  now = Date.now,
}: OfferUndoParams): Promise<void> {
  if (!canStillUndo(deletedAt, now())) {
    toast.error(undoExpiredMessage(deleted.length));
    return;
  }
  const { restored, failed } = await restoreRecords(kind, deleted);
  invalidateAfterDelete(queryClient, kind);
  if (restored.length > 0) {
    toast.success(restoredToast(kind, restored.length));
    onRestored?.(restored);
  }
  if (failed.length > 0) {
    const message = failed[0]?.message ?? '';
    // Sonner dismissed the original toast when Undo was pressed, so a transient
    // failure needs its own Undo, for the failed items only, and only until the
    // ORIGINAL window closes (the server's can_undo_soft_delete is authoritative;
    // past it, undoDelete says who can restore).
    const remaining = UNDO_WINDOW_MS - (now() - deletedAt);
    if (failed.every(f => f.retryable) && remaining > 0) {
      const retryTargets = failed.map(f => f.target);
      toast.error(message, {
        duration: remaining,
        action: {
          label: 'Undo',
          onClick: () => {
            void undoDelete({
              kind,
              deleted: retryTargets,
              deletedAt,
              queryClient,
              onRestored,
              now,
            });
          },
        },
      });
    } else {
      toast.error(message);
    }
  }
}

export function offerUndoToast(params: OfferUndoParams): void {
  if (params.deleted.length === 0) return;
  showUndoToast({
    message: deletedToast(params.kind, params.deleted),
    duration: DELETE_TOAST_MS,
    onUndo: () => {
      void undoDelete(params);
    },
  });
}

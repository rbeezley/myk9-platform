/**
 * Items the delete preview found already gone (P0002 from `delete_preview`:
 * missing, or deleted on another device). They are reconciled on this device
 * exactly as an "already deleted" answer from the delete itself is, with no
 * Undo (this session did not delete them), and they drop out of the delete so a
 * stale item never blocks the rest of a bulk selection (MYK9-922).
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { reconcileLocalDeletion } from './deleteLocalState';
import { invalidateAfterDelete } from './deleteRecords';
import type { DeleteObjectKind, DeleteTarget } from './deleteTypes';

export interface AlreadyGoneTargets {
  /** Still on the server: these are what the dialog shows and deletes. */
  liveTargets: DeleteTarget[];
  /** Already gone on the server, in the caller's order. */
  goneTargets: DeleteTarget[];
}

export function splitAlreadyGone(
  targets: readonly DeleteTarget[],
  goneIds: readonly string[]
): AlreadyGoneTargets {
  const gone = new Set(goneIds);
  return {
    liveTargets: targets.filter(target => !gone.has(target.id)),
    goneTargets: targets.filter(target => gone.has(target.id)),
  };
}

/**
 * Purge each newly gone target from this device once, then refresh the lists.
 * When every target turned out to be gone, `onAllGone` runs once, after the
 * purge, so the caller can close the dialog and clear its selection.
 */
export function useReconcileAlreadyGone(
  kind: DeleteObjectKind,
  targets: readonly DeleteTarget[],
  goneTargets: readonly DeleteTarget[],
  onAllGone: (gone: DeleteTarget[]) => void
): void {
  const queryClient = useQueryClient();
  const handled = useRef(new Set<string>());
  const onAllGoneRef = useRef(onAllGone);
  useEffect(() => {
    onAllGoneRef.current = onAllGone;
  });

  useEffect(() => {
    const fresh = goneTargets.filter(target => !handled.current.has(target.id));
    if (fresh.length === 0) return;
    for (const target of fresh) handled.current.add(target.id);
    const allGone = targets.length > 0 && goneTargets.length === targets.length;
    const gone = [...goneTargets];
    void (async () => {
      for (const target of fresh) await reconcileLocalDeletion(kind, target);
      invalidateAfterDelete(queryClient, kind);
      if (allGone) onAllGoneRef.current(gone);
    })();
  }, [kind, targets, goneTargets, queryClient]);
}

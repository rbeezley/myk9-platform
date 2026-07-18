/**
 * Bulk-delete dispatch for Class Management.
 *
 * DELETE reuses `useDeleteClassMutation` per class — the SAME mutation single-class
 * delete uses, which delegates to the `soft_delete_class` SECURITY DEFINER RPC
 * (recoverable, entry-cascading, atomic) AND runs the full onSuccess cache
 * invalidation (detail removal, lists, statistics, all-trial caches, entry
 * queries). Dispatching the raw `deleteClass` service directly would skip those
 * invalidations and leave mounted class-detail/scoring/entry views stale after a
 * bulk delete (Codex review). Using `replicatedClassesTable.deleteClass` would
 * queue a raw hard DELETE that cascade-removes entries irrecoverably.
 *
 * Bulk STATUS change was descoped (MYK9-59): a correct one must set
 * `status_source='manual'` plus the per-status timing fields the canonical
 * show-map path uses, or server derivation overwrites it — a distinct feature.
 * Status transitions remain available per-row via the shared catalog.
 *
 * Uses `useBulkDispatch`'s `Promise.allSettled` fold + in-flight latch + summary
 * toast (design.md decision D3), matching Entry Management's pattern.
 */
import { useCallback } from 'react';
import { useDeleteClassMutation } from '@/hooks/queries/useClassesDatabase';
import { useBulkDispatch } from '@/hooks/useBulkDispatch';
import type { ClassActionItem } from './classActions';

export interface UseClassBulkActionsOptions {
  classesById: Map<string, ClassActionItem>;
}

export interface UseClassBulkActionsResult {
  bulkBusy: boolean;
  handleBulkDelete: (classIds: string[]) => Promise<boolean>;
}

export function useClassBulkActions({
  classesById,
}: UseClassBulkActionsOptions): UseClassBulkActionsResult {
  const deleteClassMutation = useDeleteClassMutation();

  const label = useCallback(
    (classId: string) => classesById.get(classId)?.name || 'Untitled Class',
    [classesById]
  );

  const deleteDispatch = useBulkDispatch<string>({ getLabel: label });

  const handleBulkDelete = useCallback(
    async (classIds: string[]) => {
      if (classIds.length === 0) return false;
      // Per-class via the shared mutation: soft delete + all cache invalidations,
      // identical to single-class delete. allSettled isolates per-item failures.
      const outcome = await deleteDispatch.run(classIds, async classId => {
        await deleteClassMutation.mutateAsync({ id: classId });
      });
      // null = latched no-op — treat as not-done so the selection is kept.
      return outcome !== null && outcome.failed.length === 0;
    },
    [deleteDispatch, deleteClassMutation]
  );

  return {
    bulkBusy: deleteDispatch.isBusy,
    handleBulkDelete,
  };
}

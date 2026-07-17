/**
 * Bulk-delete dispatch for Class Management.
 *
 * DELETE goes through the `deleteClass` service, which delegates to the
 * `soft_delete_class` SECURITY DEFINER RPC — the SAME path single-class delete
 * uses. This is a SOFT delete (class + entries recoverable, atomic). Using
 * `replicatedClassesTable.deleteClass` here would queue a raw hard DELETE that
 * cascade-removes entries irrecoverably and diverges from single-class semantics
 * (Codex review). The RPC is online-only, matching single delete.
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
import { useQueryClient } from '@tanstack/react-query';
import { deleteClass } from '@/services/database/classes';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { useBulkDispatch } from '@/hooks/useBulkDispatch';
import type { ClassActionItem } from './classActions';

export interface UseClassBulkActionsOptions {
  trialId: string | undefined;
  classesById: Map<string, ClassActionItem>;
}

export interface UseClassBulkActionsResult {
  bulkBusy: boolean;
  handleBulkDelete: (classIds: string[]) => Promise<boolean>;
}

export function useClassBulkActions({
  trialId,
  classesById,
}: UseClassBulkActionsOptions): UseClassBulkActionsResult {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    if (trialId) {
      queryClient.invalidateQueries({ queryKey: classKeys.byTrial(trialId) });
    }
  }, [queryClient, trialId]);

  const label = useCallback(
    (classId: string) => classesById.get(classId)?.name || 'Untitled Class',
    [classesById]
  );

  const deleteDispatch = useBulkDispatch<string>({ getLabel: label });

  const handleBulkDelete = useCallback(
    async (classIds: string[]) => {
      if (classIds.length === 0) return false;
      try {
        const outcome = await deleteDispatch.run(classIds, async classId => {
          // Soft delete via the shared service (soft_delete_class RPC) — same
          // recoverable, entry-cascading path as single-class delete.
          const { error } = await deleteClass(classId);
          if (error) throw error;
        });
        // null = latched no-op — treat as not-done so the selection is kept.
        return outcome !== null && outcome.failed.length === 0;
      } finally {
        invalidate();
      }
    },
    [deleteDispatch, invalidate]
  );

  return {
    bulkBusy: deleteDispatch.isBusy,
    handleBulkDelete,
  };
}

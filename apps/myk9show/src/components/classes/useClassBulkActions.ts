/**
 * Bulk status-change and bulk-delete dispatch for Class Management.
 *
 * Routes both through `replicatedClassesTable` (not the direct
 * `services/database/classes/reads.ts updateClass`/`deleteClass` seam — verified
 * task 2.1: that seam is a direct Supabase write, not replication-backed). Uses
 * `useBulkDispatch`'s `Promise.allSettled` fold + in-flight latch + summary toast
 * (design.md decision D3), matching Entry Management's bulk pattern.
 */
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { replicatedClassesTable } from '@/services/replication';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { useBulkDispatch } from '@/hooks/useBulkDispatch';
import type { ClassActionItem } from './classActions';

export interface UseClassBulkActionsOptions {
  trialId: string | undefined;
  classesById: Map<string, ClassActionItem>;
}

export interface UseClassBulkActionsResult {
  bulkBusy: boolean;
  handleBulkStatusChange: (classIds: string[], status: string) => Promise<boolean>;
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

  const statusDispatch = useBulkDispatch<string>({ getLabel: label });
  const deleteDispatch = useBulkDispatch<string>({ getLabel: label });

  const handleBulkStatusChange = useCallback(
    async (classIds: string[], status: string) => {
      if (classIds.length === 0) return false;
      try {
        const outcome = await statusDispatch.run(classIds, async classId => {
          await replicatedClassesTable.updateClass(classId, { classStatus: status });
        });
        // null = latched no-op — treat as not-done so the selection is kept.
        return outcome !== null && outcome.failed.length === 0;
      } finally {
        invalidate();
      }
    },
    [statusDispatch, invalidate]
  );

  const handleBulkDelete = useCallback(
    async (classIds: string[]) => {
      if (classIds.length === 0) return false;
      try {
        const outcome = await deleteDispatch.run(classIds, async classId => {
          await replicatedClassesTable.deleteClass(classId);
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
    bulkBusy: statusDispatch.isBusy || deleteDispatch.isBusy,
    handleBulkStatusChange,
    handleBulkDelete,
  };
}

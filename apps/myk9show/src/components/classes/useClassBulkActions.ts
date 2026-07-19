/**
 * Bulk-delete + bulk-status dispatch for Class Management.
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
 * STATUS change (MYK9-59) dispatches `applyManualClassStatus` per class — the
 * same canonical replicated mutation the row path and Show Map use, so
 * `status_source='manual'` and the per-status timing fields are always set.
 * Each dispatch snapshots the eligible classes' pre-batch status via a per-run
 * `applicableWhen`: a retry re-checks the class's FRESH status (read from
 * `classesById`, which the caller keeps current) against that snapshot, so a
 * class another actor has since moved is skipped rather than overwritten.
 *
 * Both dispatches share the busy latch semantics via a combined `bulkBusy` —
 * one instance of `useBulkDispatch` per action so delete and status retries
 * don't collide in the same in-flight ref, but the bar disables while either
 * is running (matches the single shared latch the bar previously relied on
 * for delete alone).
 *
 * Uses `useBulkDispatch`'s `Promise.allSettled` fold + in-flight latch + summary
 * toast (design.md decision D3), matching Entry Management's pattern.
 */
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { classKeys, useDeleteClassMutation } from '@/hooks/queries/useClassesDatabase';
import { useBulkDispatch } from '@/hooks/useBulkDispatch';
import { applyManualClassStatus, type ManualClassStatus } from '@/services/show-day/classStatusMutations';
import type { ClassActionItem } from './classActions';

export interface UseClassBulkActionsOptions {
  classesById: Map<string, ClassActionItem>;
}

export interface UseClassBulkActionsResult {
  bulkBusy: boolean;
  handleBulkDelete: (classIds: string[], onFullSuccess?: () => void) => Promise<boolean>;
  handleBulkStatusChange: (
    classIds: string[],
    status: string,
    onFullSuccess?: () => void
  ) => Promise<boolean>;
}

export function useClassBulkActions({
  classesById,
}: UseClassBulkActionsOptions): UseClassBulkActionsResult {
  const queryClient = useQueryClient();
  const deleteClassMutation = useDeleteClassMutation();

  const label = useCallback(
    (classId: string) => classesById.get(classId)?.name || 'Untitled Class',
    [classesById]
  );

  const deleteDispatch = useBulkDispatch<string>({ getLabel: label });
  const statusDispatch = useBulkDispatch<string>({ getLabel: label });

  const handleBulkDelete = useCallback(
    async (classIds: string[], onFullSuccess?: () => void) => {
      if (classIds.length === 0) return false;
      // Per-class via the shared mutation: soft delete + all cache invalidations,
      // identical to single-class delete. allSettled isolates per-item failures.
      const outcome = await deleteDispatch.run(
        classIds,
        async classId => {
          await deleteClassMutation.mutateAsync({ id: classId });
        },
        { onFullSuccess }
      );
      // null = latched no-op — treat as not-done so the selection is kept.
      return outcome !== null && outcome.failed.length === 0;
    },
    [deleteDispatch, deleteClassMutation]
  );

  const handleBulkStatusChange = useCallback(
    async (classIds: string[], status: string, onFullSuccess?: () => void) => {
      if (classIds.length === 0) return false;
      // Snapshot each class's status AT DISPATCH TIME (not the target status).
      // A retry re-checks the class's fresh status (from `classesById`, which is
      // caller-owned and re-renders with live data) against this snapshot — a
      // mismatch means someone else changed the class since this batch started,
      // so it's skipped rather than overwritten.
      const statusAtDispatch = new Map(
        classIds.map(id => [id, classesById.get(id)?.status ?? null])
      );
      const outcome = await statusDispatch.run(
        classIds,
        async classId => {
          await applyManualClassStatus(classId, status as ManualClassStatus);
          // Invalidate PER SUCCEEDED ITEM (mirrors how delete stays fresh via
          // useDeleteClassMutation's onSuccess): this is the only seam that also
          // covers toast-driven retries, which run inside useBulkDispatch after
          // any page-level wrapper has already returned. Partial success still
          // refreshes the succeeded rows. The hook doesn't know trialId, so use
          // the all-trial-caches key — same as delete's onSuccess.
          await queryClient.invalidateQueries({ queryKey: [...classKeys.all, 'trial'] });
        },
        {
          onFullSuccess,
          applicableWhen: classId =>
            classesById.get(classId)?.status === statusAtDispatch.get(classId),
        }
      );
      return outcome !== null && outcome.failed.length === 0;
    },
    [statusDispatch, classesById, queryClient]
  );

  return {
    bulkBusy: deleteDispatch.isBusy || statusDispatch.isBusy,
    handleBulkDelete,
    handleBulkStatusChange,
  };
}

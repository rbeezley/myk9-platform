/**
 * Bulk status-change and bulk-delete dispatch for Class Management.
 *
 * - STATUS goes through `replicatedClassesTable.updateClass` (offline-capable;
 *   the direct `services/database/classes/reads.ts updateClass` seam bypasses
 *   replication — verified task 2.1).
 * - DELETE goes through the `deleteClass` service, which delegates to the
 *   `soft_delete_class` SECURITY DEFINER RPC — the SAME path single-class delete
 *   uses. This is a SOFT delete (class + entries recoverable, atomic). Using
 *   `replicatedClassesTable.deleteClass` here would queue a raw hard DELETE that
 *   cascade-removes entries irrecoverably and diverges from single-class
 *   semantics (Codex review). The RPC is online-only, matching single delete.
 *
 * Both use `useBulkDispatch`'s `Promise.allSettled` fold + in-flight latch +
 * summary toast (design.md decision D3), matching Entry Management's pattern.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { replicatedClassesTable } from '@/services/replication';
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
  handleBulkStatusChange: (classIds: string[], status: string) => Promise<boolean>;
  handleBulkDelete: (classIds: string[]) => Promise<boolean>;
}

export function useClassBulkActions({
  trialId,
  classesById,
}: UseClassBulkActionsOptions): UseClassBulkActionsResult {
  const queryClient = useQueryClient();

  // Latest class map, read at RETRY time (which fires later, from the toast) so a
  // retry re-checks fresh status rather than the map captured at dispatch. Updated
  // in an effect (not during render) per react-hooks/refs.
  const classesByIdRef = useRef(classesById);
  useEffect(() => {
    classesByIdRef.current = classesById;
  }, [classesById]);

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
        const outcome = await statusDispatch.run(
          classIds,
          async classId => {
            await replicatedClassesTable.updateClass(classId, { classStatus: status });
          },
          {
            // On retry, re-read the class's CURRENT status from the freshest map
            // and skip any already in the target status (e.g. another actor set it
            // meanwhile) rather than overwriting a newer state.
            applicableWhen: classId => classesByIdRef.current.get(classId)?.status !== status,
          }
        );
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
    bulkBusy: statusDispatch.isBusy || deleteDispatch.isBusy,
    handleBulkStatusChange,
    handleBulkDelete,
  };
}

import { toast } from 'sonner';
import { queryClient } from '@/lib/queryClient';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { upsertClassJudgeAssignment } from '@/services/database/judges';
import { replicatedClassesTable } from '@/services/replication';
import { logger } from '@/services/LoggingService';
import { useTrialStore } from '@/store/trialStore';
import { useConnectionHint } from '@/hooks/useConnectionHint';
import type { ClassData } from '@/components/classes/types/classTypes';

interface UseClassEditActionsOptions {
  /** The show the class belongs to; the judge assignment is saved against it. */
  showId: string | undefined;
  updateClass: (id: string, data: Partial<ClassData>) => Promise<unknown>;
  deleteClass: (id: string) => Promise<void>;
}

/**
 * The one save and delete path for a class edited through `ClassEditPanel`, shared by
 * Class Details and the Setup row menu (MYK9-900). Both report success or failure with the
 * same toasts; navigation after a delete stays with the caller.
 */
export function useClassEditActions({
  showId,
  updateClass,
  deleteClass,
}: UseClassEditActionsOptions) {
  // `updateClass` / `deleteClass` write straight to Supabase (no replicated path yet), so offline
  // they say so up front instead of failing after the fact with a generic error.
  const connectionHint = useConnectionHint();

  /**
   * `data` is the full merged class (existing fields plus the panel's edits). Resolves on
   * success; REJECTS on failure (offline or a failed write) so the edit panel stays open with
   * the user's edits and shows the reason.
   */
  const saveClass = async (
    classId: string,
    data: Partial<ClassData>,
    trialId: string | undefined,
    /**
     * The judge the class had when the editor opened. The judge assignment is written only when
     * the user actually changed it relative to this: an unknown or empty original judge (a read
     * that carries no assignments maps it to '') is NOT a removal, and writing '' through
     * `upsertClassJudgeAssignment` would delete the existing assignment.
     */
    originalJudgeId?: string | null
  ): Promise<void> => {
    if (connectionHint) {
      throw new Error(`Can't save this class: ${connectionHint.toLowerCase()}.`);
    }
    try {
      // Save the judge assignment FIRST (with replication sync) before updateClass,
      // so React Query's onSuccess refetch reads fresh judge data from replication cache
      const judgeId = (data as Record<string, unknown>).judgeId as string | undefined;
      const judgeChanged =
        judgeId !== undefined && judgeId !== '' && judgeId !== (originalJudgeId ?? undefined);
      if (judgeChanged && showId) {
        try {
          await upsertClassJudgeAssignment(showId, classId, judgeId);
          // Refresh replication cache so updateClass's onSuccess invalidation refetches fresh judge data
          await replicatedClassesTable.sync('');
        } catch (judgeError) {
          logger.warn('Failed to save judge assignment', 'classes', {
            classId,
            error: judgeError instanceof Error ? judgeError.message : String(judgeError),
          });
          // Continue to class update even if judge assignment fails
        }
      }

      // Now update class — its onSuccess invalidation will refetch fresh judge data
      await updateClass(classId, data);

      // Setup's rows come from the replicated store, not React Query: refresh the replica from
      // the server write (best-effort; the write itself already succeeded), then the store.
      try {
        await replicatedClassesTable.sync('');
      } catch {
        // Offline sync failure is not a save failure; background sync will converge.
      }
      await useTrialStore.getState().loadTrialClasses();
      // Invalidate specific query keys for classes (safety net after fresh refetch)
      queryClient.invalidateQueries({ queryKey: classKeys.lists() });
      if (trialId) {
        queryClient.invalidateQueries({ queryKey: classKeys.byTrial(trialId) });
      }
      queryClient.invalidateQueries({ queryKey: classKeys.detail(classId) });

      toast.success('Class updated successfully');
    } catch (error) {
      logger.error('Failed to update class', 'classes', { classId }, error as Error);
      throw error;
    }
  };

  /** Resolves on success; REJECTS on failure so the delete dialog stays open and says why. */
  const removeClass = async (classId: string): Promise<void> => {
    if (connectionHint) {
      throw new Error(`Can't delete this class: ${connectionHint.toLowerCase()}.`);
    }
    try {
      await deleteClass(classId);
      // The server delete (soft_delete_class RPC) is done. Setup's rows come from the replicated
      // store, so drop the class from the local replica (no queued mutation: it is already
      // deleted upstream) and reload the store, or it stays listed and actionable until the
      // next background sync.
      try {
        await replicatedClassesTable.delete(classId);
      } catch (replicaError) {
        logger.warn('Failed to drop deleted class from the local replica', 'classes', {
          classId,
          error: replicaError instanceof Error ? replicaError.message : String(replicaError),
        });
      }
      await useTrialStore.getState().loadTrialClasses();
      // Guarantee the row goes even if the replica delete above failed.
      useTrialStore.setState(state => ({
        trialClasses: Object.fromEntries(
          Object.entries(state.trialClasses).map(([trialId, classes]) => [
            trialId,
            classes.filter(cls => cls.id !== classId),
          ])
        ),
      }));
      toast.success('Class deleted successfully');
    } catch (error) {
      logger.error('Failed to delete class', 'classes', { classId }, error as Error);
      throw error;
    }
  };

  return { saveClass, removeClass };
}

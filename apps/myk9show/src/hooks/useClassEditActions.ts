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
}

/**
 * The one save path for a class edited through `ClassEditPanel`, shared by Class Details and
 * the Setup row menu (MYK9-900). Delete is the shared `DeleteObjectDialog` (features/delete),
 * which owns the server call and the replica purge for every class surface.
 */
export function useClassEditActions({ showId, updateClass }: UseClassEditActionsOptions) {
  // `updateClass` writes straight to Supabase (no replicated path yet), so offline it says so
  // up front instead of failing after the fact with a generic error.
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

  return { saveClass };
}

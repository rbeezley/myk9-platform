import { toast } from 'sonner';
import { queryClient } from '@/lib/queryClient';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { upsertClassJudgeAssignment } from '@/services/database/judges';
import { replicatedClassesTable } from '@/services/replication';
import { logger } from '@/services/LoggingService';
import { useTrialStore } from '@/store/trialStore';
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
  /** `data` is the full merged class (existing fields plus the panel's edits). */
  const saveClass = async (
    classId: string,
    data: Partial<ClassData>,
    trialId: string | undefined
  ): Promise<boolean> => {
    try {
      // Save the judge assignment FIRST (with replication sync) before updateClass,
      // so React Query's onSuccess refetch reads fresh judge data from replication cache
      const judgeId = (data as Record<string, unknown>).judgeId as string | undefined;
      if (judgeId !== undefined && showId) {
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

      useTrialStore.getState().loadTrialClasses();
      // Invalidate specific query keys for classes (safety net after fresh refetch)
      queryClient.invalidateQueries({ queryKey: classKeys.lists() });
      if (trialId) {
        queryClient.invalidateQueries({ queryKey: classKeys.byTrial(trialId) });
      }
      queryClient.invalidateQueries({ queryKey: classKeys.detail(classId) });

      toast.success('Class updated successfully');
      return true;
    } catch (error) {
      logger.error('Failed to update class', 'classes', { classId }, error as Error);
      toast.error('Failed to update class');
      return false;
    }
  };

  const removeClass = async (classId: string): Promise<boolean> => {
    try {
      await deleteClass(classId);
      toast.success('Class deleted successfully');
      return true;
    } catch (error) {
      logger.error('Failed to delete class', 'classes', { classId }, error as Error);
      toast.error('Failed to delete class');
      return false;
    }
  };

  return { saveClass, removeClass };
}

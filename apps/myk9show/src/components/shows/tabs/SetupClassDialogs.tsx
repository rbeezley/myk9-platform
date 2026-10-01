import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ClassEditPanel } from '@/components/panels/edit/ClassEditPanel';
import { DeleteClassDialog } from '@/pages/ClassDetailsPage/DeleteClassDialog';
import type { ClassData } from '@/components/classes/types/classTypes';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { upsertClassJudgeAssignment } from '@/services/database/judges';
import { replicatedClassesTable } from '@/services/replication';
import { logger } from '@/services/LoggingService';
import { useTrialStore } from '@/store/trialStore';

export interface SetupClassAction {
  classId: string;
  action: 'edit' | 'delete';
}

interface SetupClassDialogsProps {
  showId: string;
  pending: SetupClassAction;
  onClose: () => void;
}

/**
 * The existing class edit panel and delete dialog, opened from a Setup row
 * (MYK9-900). Same wiring as Class Details (`ClassDetailsPage/index.tsx`):
 * the judge assignment is saved and replicated first, then `updateClass`, and
 * delete goes through the same store call, so offline queuing is unchanged.
 * Mounted only while an action is pending so the page does not subscribe to
 * class and entry queries it never reads.
 */
export function SetupClassDialogs({ showId, pending, onClose }: SetupClassDialogsProps) {
  const queryClient = useQueryClient();
  const { classes, updateClass, deleteClass } = useClassStoreCompat();
  const currentClass = classes.find(cls => cls.id === pending.classId) ?? null;

  const handleSave = async (data: Partial<ClassData>) => {
    if (!currentClass) return;
    const classId = currentClass.id;
    try {
      const judgeId = (data as Record<string, unknown>).judgeId as string | undefined;
      if (judgeId !== undefined) {
        try {
          await upsertClassJudgeAssignment(showId, classId, judgeId);
          await replicatedClassesTable.sync('');
        } catch (judgeError) {
          logger.warn('Failed to save judge assignment', 'classes', {
            classId,
            error: judgeError instanceof Error ? judgeError.message : String(judgeError),
          });
        }
      }
      await updateClass(classId, { ...currentClass, ...data } as Partial<ClassData>);
      useTrialStore.getState().loadTrialClasses();
      queryClient.invalidateQueries({ queryKey: classKeys.lists() });
      if (currentClass.trialId) {
        queryClient.invalidateQueries({ queryKey: classKeys.byTrial(currentClass.trialId) });
      }
      queryClient.invalidateQueries({ queryKey: classKeys.detail(classId) });
      toast.success('Class updated successfully');
    } catch (error) {
      logger.error('Failed to update class', 'classes', { classId }, error as Error);
      toast.error('Failed to update class');
    }
    onClose();
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteClass(pending.classId);
      toast.success('Class deleted successfully');
    } catch (error) {
      logger.error(
        'Failed to delete class',
        'classes',
        { classId: pending.classId },
        error as Error
      );
      toast.error('Failed to delete class');
    }
    onClose();
  };

  if (!currentClass) return null;

  return pending.action === 'edit' ? (
    <ClassEditPanel
      open
      onClose={onClose}
      classId={currentClass.id}
      className={currentClass.element || ''}
      initialClassData={currentClass}
      showId={showId}
      onSave={async classData => handleSave(classData as Partial<ClassData>)}
    />
  ) : (
    <DeleteClassDialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
      currentClass={currentClass}
      onConfirm={handleConfirmDelete}
    />
  );
}

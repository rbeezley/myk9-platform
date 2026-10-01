import { ClassEditPanel } from '@/components/panels/edit/ClassEditPanel';
import { DeleteClassDialog } from '@/pages/ClassDetailsPage/DeleteClassDialog';
import type { ClassData } from '@/components/classes/types/classTypes';
import { useClassEditActions } from '@/hooks/useClassEditActions';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';

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
 * (MYK9-900). Saves and deletes go through `useClassEditActions`, the same hook
 * Class Details uses, so offline queuing and toasts are identical.
 * Mounted only while an action is pending so the page does not subscribe to
 * class and entry queries it never reads.
 */
export function SetupClassDialogs({ showId, pending, onClose }: SetupClassDialogsProps) {
  const { classes, updateClass, deleteClass } = useClassStoreCompat();
  const { saveClass, removeClass } = useClassEditActions({ showId, updateClass, deleteClass });
  const currentClass = classes.find(cls => cls.id === pending.classId) ?? null;

  const handleSave = async (data: Partial<ClassData>) => {
    if (currentClass) {
      await saveClass(currentClass.id, { ...currentClass, ...data }, currentClass.trialId);
    }
    onClose();
  };

  const handleConfirmDelete = async () => {
    await removeClass(pending.classId);
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

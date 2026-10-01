import { ClassEditPanel } from '@/components/panels/edit/ClassEditPanel';
import { DeleteClassDialog } from '@/pages/ClassDetailsPage/DeleteClassDialog';
import type { ClassData } from '@/components/classes/types/classTypes';
import type { SetupClassAction } from './setupClassSnapshot';
import { useClassEditActions } from '@/hooks/useClassEditActions';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';

interface SetupClassDialogsProps {
  showId: string;
  pending: SetupClassAction;
  onClose: () => void;
}

/**
 * The existing class edit panel and delete dialog, opened from a Setup row (MYK9-900), working
 * on the snapshot the tab resolved when the action started; nothing here re-resolves the class
 * (a successful delete removes it from the stores while the confirm is still finishing). Saves
 * and deletes go through `useClassEditActions`, the same hook Class Details uses. Mounted only
 * while an action is pending so the page does not subscribe to class and entry queries it
 * never reads.
 */
export function SetupClassDialogs({ showId, pending, onClose }: SetupClassDialogsProps) {
  const { updateClass, deleteClass } = useClassStoreCompat();
  const { saveClass, removeClass } = useClassEditActions({ showId, updateClass, deleteClass });
  const currentClass = pending.classSnapshot;

  // Both reject on failure: the panel stays open with the edits, and the dialog stays open
  // with the reason. On success the panel closes itself and the dialog calls onOpenChange(false).
  const handleSave = async (data: Partial<ClassData>) => {
    await saveClass(
      currentClass.id,
      { ...currentClass, ...data } as Partial<ClassData>,
      pending.trialId,
      currentClass.judgeId
    );
  };

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
      onConfirm={() => removeClass(currentClass.id)}
    />
  );
}

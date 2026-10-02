import { ClassEditPanel } from '@/components/panels/edit/ClassEditPanel';
import { DeleteObjectDialog, classDeleteDetail } from '@/features/delete';
import { formatClassTitle } from '@/components/classes/ClassDetailsMain.helpers';
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
 * go through `useClassEditActions`, the same hook Class Details uses, and deletes through the
 * shared `DeleteObjectDialog`, the same delete and purge as every class surface. Mounted only
 * while an action is pending so the page does not subscribe to class and entry queries it
 * never reads.
 */
export function SetupClassDialogs({ showId, pending, onClose }: SetupClassDialogsProps) {
  const { updateClass } = useClassStoreCompat();
  const { saveClass } = useClassEditActions({ showId, updateClass });
  const currentClass = pending.classSnapshot;

  // Rejects on failure: the panel stays open with the edits. On success it closes itself.
  const handleSave = async (data: Partial<ClassData>) => {
    await saveClass(
      currentClass.id,
      { ...currentClass, ...data } as Partial<ClassData>,
      pending.trialId,
      currentClass.judgeId
    );
  };

  const target = {
    id: currentClass.id,
    name: formatClassTitle(currentClass) || 'this class',
    detail: classDeleteDetail({
      level: currentClass.level,
      element: currentClass.element,
      trialLabel: currentClass.trial,
    }),
    context: { showId, trialId: pending.trialId, classId: currentClass.id },
  };

  return pending.action === 'edit' ? (
    <ClassEditPanel
      open
      onClose={onClose}
      classId={currentClass.id}
      className={currentClass.element || ''}
      initialClassData={currentClass}
      showId={showId}
      onDelete={{ kind: 'class', objectLabel: 'class', targets: [target] }}
      onSave={async classData => handleSave(classData as Partial<ClassData>)}
    />
  ) : (
    <DeleteObjectDialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
      kind="class"
      targets={[target]}
    />
  );
}

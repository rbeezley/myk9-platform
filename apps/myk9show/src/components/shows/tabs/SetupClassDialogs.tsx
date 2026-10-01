import { ClassEditPanel } from '@/components/panels/edit/ClassEditPanel';
import { DeleteClassDialog } from '@/pages/ClassDetailsPage/DeleteClassDialog';
import type { ClassData } from '@/components/classes/types/classTypes';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { resolveClassFromStores } from '@/hooks/resolveClassFromStores';
import { useTrialStore } from '@/store/trialStore';
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
 * Class Details uses, so saves, deletes and the offline message are identical.
 * Mounted only while an action is pending so the page does not subscribe to
 * class and entry queries it never reads.
 */
export function SetupClassDialogs({ showId, pending, onClose }: SetupClassDialogsProps) {
  const { classes, updateClass, deleteClass } = useClassStoreCompat();
  const { saveClass, removeClass } = useClassEditActions({ showId, updateClass, deleteClass });
  // The query list is online-only and empty after a cold offline reload, while Setup still shows
  // the class from the replicated store, so resolve through the same replicated fallback Class
  // Details uses.
  const replicatedTrialClasses = useTrialStore(state => state.trialClasses);
  const currentClass = resolveClassFromStores(pending.classId, classes, replicatedTrialClasses);
  const unresolved = currentClass === null;

  // Never a silent no-op: a class that cannot be found anywhere says so and closes.
  useEffect(() => {
    if (unresolved) {
      toast.error("We couldn't load this class. Please refresh and try again.");
      onClose();
    }
  }, [unresolved, onClose]);

  // Both reject on failure: the panel stays open with the edits, and the dialog stays open
  // with the reason. On success the panel closes itself and the dialog calls onOpenChange(false).
  const handleSave = async (data: Partial<ClassData>) => {
    if (currentClass) {
      await saveClass(currentClass.id, { ...currentClass, ...data }, currentClass.trialId);
    }
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
      onConfirm={() => removeClass(pending.classId)}
    />
  );
}

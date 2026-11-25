import type { ReactNode } from 'react';

import { ClassEditPanel } from '@/components/panels/edit/ClassEditPanel';
import { classDeleteDetail } from '@/features/delete';
import { formatClassTitle } from '@/components/classes/ClassDetailsMain.helpers';
import type { CurrentClassJudge } from '@/components/panels/edit/ClassEditPanel.types';
import type { ClassData } from '@/components/classes/types/classTypes';
import type { SetupClassAction } from './setupClassSnapshot';
import { useClassEditActions } from '@/hooks/useClassEditActions';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';

interface SetupClassDialogsProps {
  showId: string;
  pending: SetupClassAction;
  onClose: () => void;
  /** Show Desk's live-saving class settings, shown in the panel (MYK9-2379). */
  liveSettings?: ReactNode;
  /** The live settings hold the Judge control, so the panel's own Judge field stays hidden. */
  liveJudge?: boolean;
  /** The class's judge and status now; the snapshot is as old as the panel. */
  currentJudge?: CurrentClassJudge | undefined;
}

/**
 * The existing class edit panel, opened from the show home's Edit class (MYK9-900, MYK9-956),
 * working on the snapshot resolved when the action started; nothing here re-resolves the class
 * (a successful delete removes it from the stores while the confirm is still finishing). Saves
 * go through `useClassEditActions`, the same hook Class Details uses, and the footer's Delete
 * through the shared `DeleteObjectDialog`, the same delete and purge as every class surface. Mounted only
 * while an action is pending so the page does not subscribe to class and entry queries it
 * never reads.
 */
export function SetupClassDialogs({
  showId,
  pending,
  onClose,
  liveSettings,
  liveJudge = false,
  currentJudge,
}: SetupClassDialogsProps) {
  const { updateClass } = useClassStoreCompat();
  const { saveClass } = useClassEditActions({ showId, updateClass });
  const currentClass = pending.classSnapshot;

  // Rejects on failure: the panel stays open with the edits. On success it closes itself.
  const handleSave = async (data: Partial<ClassData>) => {
    // The panel's patch only, never the snapshot with the patch on top: the snapshot is stale
    // by the time Save is pressed, and writing its untouched fields back would revert another
    // secretary's change (MYK9-998, Codex review of #2735).
    await saveClass(
      currentClass.id,
      data,
      pending.trialId,
      // The judge the class has now: the outgoing one a judge change replaces.
      currentJudge ? currentJudge.id : currentClass.judgeId
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

  return (
    <ClassEditPanel
      open
      onClose={onClose}
      classId={currentClass.id}
      className={target.name}
      initialClassData={currentClass}
      showId={showId}
      liveSettings={liveSettings}
      liveJudge={liveJudge}
      currentJudge={currentJudge}
      onDelete={{ kind: 'class', objectLabel: 'class', targets: [target] }}
      onSave={async classData => handleSave(classData as Partial<ClassData>)}
    />
  );
}

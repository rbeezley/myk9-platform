import type { ReactNode } from 'react';

import { SetupClassDialogs } from '@/components/shows/tabs/SetupClassDialogs';
import { useClassRowActions } from '@/components/shows/tabs/useClassRowActions';
import type { FocusedClassEditAction } from './FocusedClassActionsMenu';

/**
 * Edit class on the show home's class panel (MYK9-956): resolve the class,
 * then open the class edit panel. Delete is in that edit panel's footer, not
 * beside Edit (owner, 2026-10-03).
 *
 * A hook, held by the cockpit rather than the panel: the focused panel moves
 * between the inline and split layouts, which remounts it, and an
 * editor living inside it would close and lose its edits on a tablet rotation
 * (Codex review of #2691). The Edit class button renders in the panel; the pending
 * action and the dialogs stay with the cockpit. `classDialogs` takes the class settings the
 * panel shows (MYK9-2379), for the class they belong to, and whether they hold the Judge control.
 */
export function useFocusedClassSetupActions(showId: string) {
  const { pendingAction, setPendingAction, hydratingClassId, openClassAction } =
    useClassRowActions();
  const locked = hydratingClassId !== null || pendingAction !== null;

  // The class header's Actions menu renders the item (MYK9-1796); the lock stays here.
  const editClassAction = (classId: string, trialId: string): FocusedClassEditAction => ({
    disabled: locked,
    onSelect: () => void openClassAction({ id: classId, trialId }),
  });

  const pendingClassId = pendingAction?.classSnapshot.id ?? null;
  const classDialogs = (liveSettings?: ReactNode, liveJudge = false) =>
    pendingAction ? (
      <SetupClassDialogs
        liveSettings={liveSettings}
        liveJudge={liveJudge}
        key={pendingAction.requestId}
        showId={showId}
        pending={pendingAction}
        // Tied to THIS action: a late close from an earlier one must not clear a newer one.
        onClose={() =>
          setPendingAction(current =>
            current?.requestId === pendingAction.requestId ? null : current
          )
        }
      />
    ) : null;

  return { editClassAction, pendingClassId, classDialogs };
}

import { Pencil, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SetupClassDialogs } from '@/components/shows/tabs/SetupClassDialogs';
import { useClassRowActions } from '@/components/shows/tabs/useClassRowActions';

/**
 * Edit class / Delete class on the show home's class panel (MYK9-956): the same
 * resolve-then-open flow and the same panel and dialog as Setup → Classes.
 *
 * A hook, held by the cockpit rather than the panel: the focused panel moves
 * between the inline and split layouts at 1280px, which remounts it, and an
 * editor living inside it would close and lose its edits on a tablet rotation
 * (Codex review of #2691). The buttons render in the panel; the pending
 * action and the dialogs stay with the cockpit.
 */
export function useFocusedClassSetupActions(showId: string) {
  const { pendingAction, setPendingAction, hydratingClassId, openClassAction } = useClassRowActions(
    showId,
    // Status changes on the home go through the panel's own status control.
    () => {}
  );
  const locked = hydratingClassId !== null || pendingAction !== null;

  const renderClassActions = (classId: string, trialId: string, classLabel: string) => {
    const target = { id: classId, trialId };
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 gap-2"
          disabled={locked}
          aria-label={`Edit class ${classLabel}`}
          onClick={() => void openClassAction(target, 'edit')}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit class
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 gap-2 text-destructive hover:text-destructive"
          disabled={locked}
          aria-label={`Delete class ${classLabel}`}
          onClick={() => void openClassAction(target, 'delete')}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete class
        </Button>
      </div>
    );
  };

  const classDialogs = pendingAction ? (
    <SetupClassDialogs
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

  return { renderClassActions, classDialogs };
}

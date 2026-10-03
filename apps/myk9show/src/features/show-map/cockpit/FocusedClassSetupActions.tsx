import { Pencil, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SetupClassDialogs } from '@/components/shows/tabs/SetupClassDialogs';
import { useClassRowActions } from '@/components/shows/tabs/useClassRowActions';

const NO_STATUS_CHANGE = () => {};

/**
 * Edit class / Delete class on the show home's class panel (MYK9-956): the same
 * resolve-then-open flow and the same panel and dialog as Setup → Classes.
 */
export function FocusedClassSetupActions({
  showId,
  classId,
  trialId,
  classLabel,
}: {
  showId: string;
  classId: string;
  trialId: string;
  classLabel: string;
}) {
  const { pendingAction, setPendingAction, hydratingClassId, openClassAction } = useClassRowActions(
    showId,
    NO_STATUS_CHANGE
  );
  const locked = hydratingClassId !== null || pendingAction !== null;
  const target = { id: classId, trialId };

  return (
    <>
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
      {pendingAction && (
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
      )}
    </>
  );
}

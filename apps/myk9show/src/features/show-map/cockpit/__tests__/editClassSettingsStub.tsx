import { useState, type ReactNode } from 'react';

import type { SetupClassAction } from '@/components/shows/tabs/setupClassSnapshot';

/**
 * Stands in for the real Edit class panel in cockpit tests that drive a Class settings control
 * (MYK9-2379: they sit in that panel, not the header). `useClassRowActions` resolves the class
 * from the replica and `SetupClassDialogs` mounts the panel; both are replaced so a test opens
 * it with a click on Edit class and finds the settings the cockpit hands it.
 */
export function classRowActionsStub(openAtStart: boolean, snapshot?: Record<string, unknown>) {
  return {
    useClassRowActions: () => {
      const [pendingAction, setPendingAction] = useState<SetupClassAction | null>(
        openAtStart ? stubAction(snapshot) : null
      );
      return {
        pendingAction,
        setPendingAction,
        hydratingClassId: null,
        openClassAction: async () => setPendingAction(stubAction(snapshot)),
      };
    },
  };
}

function stubAction(snapshot?: Record<string, unknown>): SetupClassAction {
  return {
    classSnapshot: { id: 'class-1', ...snapshot } as SetupClassAction['classSnapshot'],
    trialId: 'trial-1',
    requestId: 1,
  };
}

export function SetupClassDialogsStub({
  liveSettings,
  liveJudge,
}: {
  liveSettings?: ReactNode;
  liveJudge?: boolean;
}) {
  return (
    <div role="dialog" aria-label="Edit Class" data-live-judge={String(liveJudge ?? false)}>
      {liveSettings}
    </div>
  );
}

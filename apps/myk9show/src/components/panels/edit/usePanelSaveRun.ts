import { useCallback, useRef, useState } from 'react';
import type { EditPanelSaveContext } from './EditPanelWrapper.types';
import {
  announceDetachedSaveSettled,
  reportDetachedSaveFailure,
  reportPanelSaveFailure,
} from './editPanelSaveFeedback';

/** One click of Save. `detached` once the person left the panel while it ran. */
interface SaveAttempt {
  detached: boolean;
}

/**
 * Runs EditPanelWrapper's save and owns its "saving" state and the "Still
 * saving" prompt (MYK9-1125).
 *
 * A save that never settles (an online-only request that lost its connection,
 * or one that simply hangs) must not trap the person in the panel, so
 * `leaveWhileSaving` lets them go and the save keeps running. Its late result
 * is then toasted instead of acting on a form that is gone: a write the person
 * walked away from is never silent, and it never closes the host a second time.
 * `save` receives the save context, whose `isCurrent` lets the host's own
 * navigation and callbacks stand down too (EditPanelSaveContext.isCurrent).
 */
export function usePanelSaveRun<T>({
  title,
  successMessage,
  runSelfNavigation,
}: {
  title: string;
  successMessage: string | ((data: T) => string) | undefined;
  runSelfNavigation: EditPanelSaveContext['runSelfNavigation'];
}) {
  const [isSaving, setSavingState] = useState(false);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const currentRef = useRef<SaveAttempt | null>(null);

  // The prompt only ever asks about a save in flight: once it ends, it is moot.
  const setIsSaving = useCallback((saving: boolean) => {
    setSavingState(saving);
    if (!saving) setLeavePromptOpen(false);
  }, []);

  const runSave = useCallback(
    async (
      save: (context: EditPanelSaveContext) => void | Promise<void>,
      saved: T,
      onSaved: () => void
    ) => {
      const attempt: SaveAttempt = { detached: false };
      currentRef.current = attempt;
      setIsSaving(true);
      try {
        // The host's own post-save steps run inside `save`, before it returns,
        // so it is told when the person has left rather than caught afterwards.
        const isCurrent = () => !attempt.detached;
        await save({
          isCurrent,
          runSelfNavigation: navigate => {
            if (isCurrent()) runSelfNavigation(navigate);
          },
        });
        if (attempt.detached) announceDetachedSaveSettled(successMessage, saved, title);
        else onSaved();
      } catch (error) {
        if (attempt.detached) reportDetachedSaveFailure(error, title);
        else reportPanelSaveFailure(error);
      } finally {
        // A detached attempt no longer owns the flag: the panel may be saving again.
        if (currentRef.current === attempt) {
          currentRef.current = null;
          setIsSaving(false);
        }
      }
    },
    [successMessage, title, setIsSaving, runSelfNavigation]
  );

  const leaveWhileSaving = useCallback(() => {
    if (currentRef.current) currentRef.current.detached = true;
    currentRef.current = null;
    setIsSaving(false);
  }, [setIsSaving]);

  return {
    isSaving,
    setIsSaving,
    runSave,
    leaveWhileSaving,
    leavePromptOpen,
    setLeavePromptOpen,
  };
}

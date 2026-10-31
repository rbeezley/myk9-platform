/**
 * Mounted for every at-show page. It reads only the prompt store and loads the prompt UI
 * (which reaches the ringside barrel) the first time there is something to ask, so the
 * entry chunk stays free of it (MYK9-844, entryChunkSplit).
 */
import { lazy, Suspense, useEffect } from 'react';
import { useMatch } from 'react-router-dom';
import { useStaleClassPromptStore } from './staleClassPromptStore';

const StaleClassPrompt = lazy(() =>
  import('./StaleClassPrompt').then(module => ({ default: module.StaleClassPrompt }))
);

export function StaleClassPromptHost() {
  const promptShowId = useStaleClassPromptStore(state => state.prompt?.showId);
  const activeShowId = useMatch('/at-show/:showId/*')?.params.showId;
  const isOtherShow = promptShowId !== undefined && promptShowId !== activeShowId;

  // A prompt belongs to the show it was offered in: leaving that show drops it, so confirming
  // can never act on a show the judge is no longer in.
  useEffect(() => {
    if (isOtherShow) useStaleClassPromptStore.getState().dismiss();
  }, [isOtherShow]);

  if (promptShowId === undefined || isOtherShow) return null;
  return (
    <Suspense fallback={null}>
      <StaleClassPrompt />
    </Suspense>
  );
}

/**
 * Mounted for every at-show page. It reads only the prompt store and loads the prompt UI
 * (which reaches the ringside barrel) the first time there is something to ask, so the
 * entry chunk stays free of it (MYK9-844, entryChunkSplit).
 */
import { lazy, Suspense } from 'react';
import { useStaleClassPromptStore } from './staleClassPromptStore';

const StaleClassPrompt = lazy(() =>
  import('./StaleClassPrompt').then(module => ({ default: module.StaleClassPrompt }))
);

export function StaleClassPromptHost() {
  const hasPrompt = useStaleClassPromptStore(state => state.prompt !== null);
  if (!hasPrompt) return null;
  return (
    <Suspense fallback={null}>
      <StaleClassPrompt />
    </Suspense>
  );
}

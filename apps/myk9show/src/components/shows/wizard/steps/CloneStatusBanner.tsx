/**
 * CloneStatusBanner — the status of a clone in progress and every way out of it.
 *
 * Rendered by ShowDetailsStep beside the clone picker and driven only by the wizard store's
 * clone state, never by the show-list query. A loading clone locks the form, so its Cancel
 * must not disappear when that query errors or empties (MYK9-604). Every recovery action
 * uses the 44px `touch` size (docs/INTENT.md, "Large touch targets").
 */
import React, { useEffect } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShowsQuery } from '@/hooks/queries/useShowsDatabase';
import { useWizardStore } from '@/store/wizardStore';
import { useCloneFromShow } from './useCloneFromShow';

export const CloneStatusBanner: React.FC = () => {
  const { cloneHydration, cloneGeneration, cancelCloneHydration, resetWizard } = useWizardStore();
  const { data: shows = [] } = useShowsQuery();
  const startClone = useCloneFromShow();

  // Leaving the step mid-load cancels the clone so its late snapshot never lands. Unmount
  // only: the store is read at cleanup time, never captured from a render.
  useEffect(
    () => () => {
      const { cloneHydration: latest, cloneGeneration: generation } = useWizardStore.getState();
      if (latest.status === 'hydrating') useWizardStore.getState().cancelCloneHydration(generation);
    },
    []
  );

  const { status, sourceShowId, sourceShowName } = cloneHydration;
  if (status === 'idle') return null;

  const dismiss = () => cancelCloneHydration(cloneGeneration);
  // Retry needs the source show's full record; if the list no longer has it, only dismiss.
  const retrySource = shows.find(show => show.id === sourceShowId);

  return (
    <div
      data-testid="clone-status"
      className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-3"
    >
      {sourceShowName && (
        <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
          <Check className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">{sourceShowName}</span>
        </div>
      )}

      {status === 'hydrating' && (
        <>
          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
            Loading the complete show before applying the clone. Editing is paused until it
            finishes.
          </p>
          <Button type="button" variant="outline" size="touch" onClick={dismiss}>
            Cancel clone
          </Button>
        </>
      )}

      {status === 'failed' && (
        <>
          <p className="text-sm text-destructive" role="alert">
            We could not load the cloned classes. Your current draft is unchanged.
          </p>
          <div className="flex flex-wrap gap-2">
            {retrySource && (
              <Button
                type="button"
                variant="outline"
                size="touch"
                onClick={() => void startClone(retrySource)}
              >
                Retry clone
              </Button>
            )}
            <Button type="button" variant="outline" size="touch" onClick={dismiss}>
              Choose another show
            </Button>
          </div>
        </>
      )}

      {status === 'ready' && (
        <>
          <p className="text-sm text-muted-foreground">
            Show dates and entry period dates were left blank. Fill them in below.
          </p>
          <Button type="button" variant="outline" size="touch" onClick={resetWizard}>
            Start fresh
          </Button>
        </>
      )}
    </div>
  );
};

import { useCallback, useState } from 'react';
import { useForceDeleteDogMutation } from '@/hooks/queries/useDogsDatabase';
import { useBulkDispatch } from '@/hooks/useBulkDispatch';
import { getDogDisplayName, type Dog } from '@/types/dog-types';

export interface UseBlockedDogDeletesResult {
  /** Dogs the server refused over paid/scored entries. Empty when nothing is pending. */
  blockedDogs: Dog[];
  /** Hand the dispatch outcome's blocked subset in. Called on retries too. */
  reportBlocked: (dogs: Dog[]) => void;
  /** Dismiss without overriding. */
  dismiss: () => void;
  /** Run `force_delete_dog` across the blocked set. */
  forceDelete: () => void;
  isSubmitting: boolean;
}

/**
 * Owns the "these dogs could not be deleted" state for the dogs browse page.
 *
 * INTENT (MYK9-584): this deliberately lives ABOVE the bulk actions bar. It used
 * to live inside it, and that was the bug: the optimistic delete removes the
 * dogs from the list, `useBulkSelection({ pruneToItems: true })` drops them from
 * the selection during render, the page stops rendering the bar, and the dialog
 * was unmounted before it could ever show. The report has to outlive the
 * selection that triggered it, so it is anchored to the page instead.
 *
 * Do not move this state back down into a selection-scoped component.
 */
export function useBlockedDogDeletes(onResolved?: () => void): UseBlockedDogDeletesResult {
  const [blockedDogs, setBlockedDogs] = useState<Dog[]>([]);
  const forceDeleteDogMutation = useForceDeleteDogMutation();
  const dispatch = useBulkDispatch<Dog>({ getLabel: getDogDisplayName });

  const reportBlocked = useCallback((dogs: Dog[]) => {
    // Replace rather than append: each dispatch reports the full blocked set
    // for that batch, and appending would duplicate a dog across a retry.
    setBlockedDogs(dogs);
  }, []);

  const dismiss = useCallback(() => setBlockedDogs([]), []);

  const forceDelete = useCallback(() => {
    const dogs = blockedDogs;
    if (dogs.length === 0) return;
    setBlockedDogs([]);
    void dispatch.run(
      dogs,
      async d => {
        await forceDeleteDogMutation.mutateAsync({ id: d.id });
      },
      { onFullSuccess: onResolved }
    );
  }, [blockedDogs, dispatch, forceDeleteDogMutation, onResolved]);

  return {
    blockedDogs,
    reportBlocked,
    dismiss,
    forceDelete,
    isSubmitting: dispatch.isBusy,
  };
}

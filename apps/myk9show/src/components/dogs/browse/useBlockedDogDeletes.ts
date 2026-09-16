import { useCallback, useState } from 'react';
import { useForceDeleteDogMutation } from '@/hooks/queries/useDogsDatabase';
import { useBulkDispatch } from '@/hooks/useBulkDispatch';
import { getDogDisplayName, type Dog } from '@/types/dog-types';
import type { BlockedDogsReason } from './BlockedDogDeleteDialog';

export interface UseBlockedDogDeletesResult {
  /** Dogs the server refused over paid/scored entries. Empty when nothing is pending. */
  blockedDogs: Dog[];
  /**
   * Why `blockedDogs` are listed. Flips to 'override-failed' when an override
   * was attempted and did not succeed, so the dialog stops asserting a reason
   * (paid/scored entries) that is no longer the true one.
   */
  reason: BlockedDogsReason;
  /** Hand the dispatch outcome's blocked subset in. Called on retries too. */
  reportBlocked: (dogs: Dog[]) => void;
  /** Dismiss without overriding. */
  dismiss: () => void;
  /** Run `force_delete_dog` across the blocked set. */
  forceDelete: () => void;
  isSubmitting: boolean;
}

/** Union by id, preserving first-seen order. */
function mergeById(existing: Dog[], incoming: Dog[]): Dog[] {
  const seen = new Set(existing.map(d => d.id));
  const merged = existing.slice();
  for (const dog of incoming) {
    if (seen.has(dog.id)) continue;
    seen.add(dog.id);
    merged.push(dog);
  }
  return merged;
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
  const [reason, setReason] = useState<BlockedDogsReason>('blocked');
  const forceDeleteDogMutation = useForceDeleteDogMutation();
  const dispatch = useBulkDispatch<Dog>({ getLabel: getDogDisplayName });

  const reportBlocked = useCallback((dogs: Dog[]) => {
    // ACCUMULATE, never replace. `useBulkDispatch` retries only the UNCLAIMED
    // subset, so a retry's blocked set is disjoint from what is already on
    // screen — replacing would drop the earlier dogs from the dialog while they
    // are also absent from the toast's detail lines (claimed items are stripped
    // there by design), leaving them reported nowhere at all. That is the exact
    // silence MYK9-584 exists to prevent, reintroduced one level up.
    setBlockedDogs(current => mergeById(current, dogs));
    setReason('blocked');
  }, []);

  const dismiss = useCallback(() => setBlockedDogs([]), []);

  const forceDelete = useCallback(() => {
    const dogs = blockedDogs;
    if (dogs.length === 0) return;

    // The list is NOT cleared up front. Clearing it synchronously unmounted the
    // dialog in the same commit that set `isBusy`, so the in-flight state could
    // never render — and a failed override destroyed the only persistent record
    // of which dogs were blocked, leaving a transient toast as the sole report.
    // Clear on full success; re-seed from the failures otherwise.
    void dispatch
      .run(
        dogs,
        async d => {
          await forceDeleteDogMutation.mutateAsync({ id: d.id });
        },
        {
          onFullSuccess: () => {
            setBlockedDogs([]);
            onResolved?.();
          },
        }
      )
      .then(outcome => {
        // `null` means the in-flight latch swallowed the dispatch: nothing ran,
        // so the list must stay exactly as it was.
        if (!outcome) return;
        if (outcome.failed.length > 0) {
          // These failed the OVERRIDE, so they are no longer "blocked over
          // paid/scored entries" — saying so would blame the entries for a
          // permission or network failure.
          setBlockedDogs(outcome.failed.map(({ item }) => item));
          setReason('override-failed');
        }
      });
  }, [blockedDogs, dispatch, forceDeleteDogMutation, onResolved]);

  return {
    blockedDogs,
    reason,
    reportBlocked,
    dismiss,
    forceDelete,
    isSubmitting: dispatch.isBusy,
  };
}

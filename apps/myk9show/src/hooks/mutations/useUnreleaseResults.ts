/**
 * useUnreleaseResults — clears results_released_at/results_released_by on classes.
 * Mirrors useReleaseResults' replicated per-class write and partial-failure surfacing,
 * so a secretary can return an already-released class to held-for-review.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsQueryKeys } from '../queries/useShowSettingsDatabase';
import { dispatchBulk } from '@/hooks/bulkDispatch';
import { replicatedClassesTable } from '@/services/replication';

interface UnreleaseResultsInput {
  classIds: string[];
  showId: string;
}

export interface UnreleaseResultsResult {
  /** Class IDs whose un-release update was queued successfully. */
  unreleased: string[];
  /** Class IDs whose un-release update failed and should be retried. */
  failed: string[];
}


export function useUnreleaseResults() {
  const queryClient = useQueryClient();

  return useMutation<UnreleaseResultsResult, Error, UnreleaseResultsInput>({
    mutationFn: async ({ classIds }) => {
      if (classIds.length === 0) return { unreleased: [], failed: [] };
      // INTENT: Same Promise.allSettled shape as useReleaseResults — one queued
      // replicated update per class, settled independently so a partial local
      // failure surfaces exactly which classes still need retrying.
      // Bounded, not `Promise.allSettled(map(...))`. Select All on a large show
      // fired one replicated write per class with no cap -- hundreds of
      // simultaneous updates and optimistic patches, the shape `bulkDispatch`
      // documents as the `ringside_update_entry` 40001 storm that pushed
      // staging past 80% CPU.
      //
      // The INTENT contract above is preserved exactly: `dispatchBulk` settles
      // every item and folds the outcome BY INDEX, so a partial failure still
      // reports precisely which classes failed and the secretary can reselect
      // and retry just those.
      const outcome = await dispatchBulk(classIds, async classId => {
        await replicatedClassesTable.updateClass(classId, {
          resultsReleasedAt: null,
          results_released_at: null,
          resultsReleasedBy: null,
          results_released_by: null,
        });
      });
      return { unreleased: outcome.succeeded, failed: outcome.failed.map(entry => entry.item) };
    },
    onSuccess: ({ unreleased }, variables) => {
      if (unreleased.length > 0) {
        queryClient.invalidateQueries({
          queryKey: settingsQueryKeys.classOverrides(variables.showId),
        });
        queryClient.invalidateQueries({ queryKey: settingsQueryKeys.all });
      }

      // NO toast here. `BulkOperationsBar` is the only layer that toasts these
      // results: it owns the selection outcome the message describes ("the
      // failed classes stayed selected so you can retry"), which this hook
      // cannot see. Both layers used to toast, so one release produced two
      // differently-worded messages and read as two separate operations.
    },
  });
}

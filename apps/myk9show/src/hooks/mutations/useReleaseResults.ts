/**
 * useReleaseResults — mutation to set results_released_at on classes.
 * Used for manual release when classes are set to review/manual_release timing.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { settingsQueryKeys } from '../queries/useShowSettingsDatabase';
import { dispatchBulk } from '@/hooks/bulkDispatch';
import { replicatedClassesTable } from '@/services/replication';

interface ReleaseResultsInput {
  classIds: string[];
  showId: string;
}

export interface ReleaseResultsResult {
  /** Class IDs whose release update was queued successfully. */
  released: string[];
  /** Class IDs whose release update failed and should be retried. */
  failed: string[];
}


export function useReleaseResults() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<ReleaseResultsResult, Error, ReleaseResultsInput>({
    mutationFn: async ({ classIds }) => {
      if (classIds.length === 0) return { released: [], failed: [] };
      const releasedAt = new Date().toISOString();
      // INTENT: Replication queues one class update per selected class, independently.
      // A partial local failure leaves a mixed release state; we settle every update so
      // we can surface exactly which classes failed. The secretary can reselect and retry
      // just those — sync preserves the queued successes.
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
          resultsReleasedAt: releasedAt,
          results_released_at: releasedAt,
          resultsReleasedBy: user?.id ?? null,
          results_released_by: user?.id ?? null,
        });
      });
      return { released: outcome.succeeded, failed: outcome.failed.map(entry => entry.item) };
    },
    onSuccess: ({ released }, variables) => {
      // Invalidate whenever at least one release landed so the UI reflects partial progress.
      if (released.length > 0) {
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

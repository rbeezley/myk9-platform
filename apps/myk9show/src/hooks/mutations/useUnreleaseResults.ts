/**
 * useUnreleaseResults — clears results_released_at/results_released_by on classes.
 * Mirrors useReleaseResults' replicated per-class write and partial-failure surfacing,
 * so a secretary can return an already-released class to held-for-review.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@/lib/notifications';
import { settingsQueryKeys } from '../queries/useShowSettingsDatabase';
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

const plural = (n: number) => (n === 1 ? '' : 'es');

export function useUnreleaseResults() {
  const queryClient = useQueryClient();

  return useMutation<UnreleaseResultsResult, Error, UnreleaseResultsInput>({
    mutationFn: async ({ classIds }) => {
      if (classIds.length === 0) return { unreleased: [], failed: [] };
      // INTENT: Same Promise.allSettled shape as useReleaseResults — one queued
      // replicated update per class, settled independently so a partial local
      // failure surfaces exactly which classes still need retrying.
      const outcomes = await Promise.allSettled(
        classIds.map(classId =>
          replicatedClassesTable.updateClass(classId, {
            resultsReleasedAt: null,
            results_released_at: null,
            resultsReleasedBy: null,
            results_released_by: null,
          })
        )
      );

      const unreleased: string[] = [];
      const failed: string[] = [];
      outcomes.forEach((outcome, i) => {
        if (outcome.status === 'fulfilled') unreleased.push(classIds[i]);
        else failed.push(classIds[i]);
      });
      return { unreleased, failed };
    },
    onSuccess: ({ unreleased, failed }, variables) => {
      if (unreleased.length > 0) {
        queryClient.invalidateQueries({
          queryKey: settingsQueryKeys.classOverrides(variables.showId),
        });
        queryClient.invalidateQueries({ queryKey: settingsQueryKeys.all });
      }

      if (failed.length === 0) {
        notifications.success(
          `Results hidden for ${unreleased.length} class${plural(unreleased.length)}`
        );
      } else if (unreleased.length === 0) {
        notifications.error(
          `Failed to hide ${failed.length} class${plural(failed.length)}. Reselect and try again.`
        );
      } else {
        notifications.warning(
          `Hid ${unreleased.length} of ${unreleased.length + failed.length} classes. ` +
            `${failed.length} failed — the failed classes stay selected so you can retry.`
        );
      }
    },
    onError: () => {
      notifications.error('Failed to hide results');
    },
  });
}

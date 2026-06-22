/**
 * useReleaseResults — mutation to set results_released_at on classes.
 * Used for manual release when classes are set to review/manual_release timing.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@/lib/notifications';
import { useAuth } from '@/hooks/useAuth';
import { settingsQueryKeys } from '../queries/useShowSettingsDatabase';
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

const plural = (n: number) => (n === 1 ? '' : 'es');

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
      const outcomes = await Promise.allSettled(
        classIds.map(classId =>
          replicatedClassesTable.updateClass(classId, {
            resultsReleasedAt: releasedAt,
            results_released_at: releasedAt,
            resultsReleasedBy: user?.id ?? null,
            results_released_by: user?.id ?? null,
          })
        )
      );

      const released: string[] = [];
      const failed: string[] = [];
      outcomes.forEach((outcome, i) => {
        if (outcome.status === 'fulfilled') released.push(classIds[i]);
        else failed.push(classIds[i]);
      });
      return { released, failed };
    },
    onSuccess: ({ released, failed }, variables) => {
      // Invalidate whenever at least one release landed so the UI reflects partial progress.
      if (released.length > 0) {
        queryClient.invalidateQueries({
          queryKey: settingsQueryKeys.classOverrides(variables.showId),
        });
        queryClient.invalidateQueries({ queryKey: settingsQueryKeys.all });
      }

      if (failed.length === 0) {
        notifications.success(`Results released for ${released.length} class${plural(released.length)}`);
      } else if (released.length === 0) {
        notifications.error(
          `Failed to release ${failed.length} class${plural(failed.length)}. Reselect and try again.`
        );
      } else {
        notifications.warning(
          `Released ${released.length} of ${released.length + failed.length} classes. ` +
            `${failed.length} failed — the failed classes stay selected so you can retry.`
        );
      }
    },
    onError: () => {
      notifications.error('Failed to release results');
    },
  });
}

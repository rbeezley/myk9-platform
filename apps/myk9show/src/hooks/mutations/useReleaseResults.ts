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

export function useReleaseResults() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ classIds }: ReleaseResultsInput) => {
      if (classIds.length === 0) return;
      const releasedAt = new Date().toISOString();
      // INTENT: Replication queues one class update per selected class. A partial
      // local failure can leave a mixed release state; the secretary can retry
      // the failed class selection and sync will preserve queued successes.
      await Promise.all(
        classIds.map(classId =>
          replicatedClassesTable.updateClass(classId, {
            resultsReleasedAt: releasedAt,
            results_released_at: releasedAt,
            resultsReleasedBy: user?.id ?? null,
            results_released_by: user?.id ?? null,
          })
        )
      );
    },
    onSuccess: (_, variables) => {
      notifications.success(
        `Results released for ${variables.classIds.length} class${variables.classIds.length === 1 ? '' : 'es'}`
      );
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.classOverrides(variables.showId),
      });
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.all });
    },
    onError: () => {
      notifications.error('Failed to release results');
    },
  });
}

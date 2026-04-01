/**
 * useReleaseResults — mutation to set results_released_at on classes.
 * Used for manual release when classes are set to review/manual_release timing.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { notifications } from '@/lib/notifications';
import { useAuth } from '@/hooks/useAuth';
import { settingsQueryKeys } from '../queries/useShowSettingsDatabase';

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
      const { error } = await supabase
        .from('classes')
        .update({
          results_released_at: new Date().toISOString(),
          results_released_by: user?.id ?? null,
        })
        .in('id', classIds);

      if (error) throw error;
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

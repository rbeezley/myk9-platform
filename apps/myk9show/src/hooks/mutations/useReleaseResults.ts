/**
 * useReleaseResults — mutation to set results_released_at on classes.
 * Used for manual release when classes are set to review/manual_release timing.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { toast } from 'sonner';
import { settingsQueryKeys } from '../queries/useShowSettingsDatabase';

interface ReleaseResultsInput {
  classIds: string[];
  showId: string;
}

export function useReleaseResults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ classIds }: ReleaseResultsInput) => {
      const { error } = await supabase
        .from('classes')
        .update({ results_released_at: new Date().toISOString() })
        .in('id', classIds);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(
        `Results released for ${variables.classIds.length} class${variables.classIds.length === 1 ? '' : 'es'}`
      );
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.classOverrides(variables.showId),
      });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
    onError: () => {
      toast.error('Failed to release results');
    },
  });
}

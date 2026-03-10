/**
 * useCheckInMutation — Optimistic check-in status update via React Query.
 *
 * Updates the entry's check-in status in Supabase with optimistic UI update
 * on the showDayDetails query cache. Rolls back on failure.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CheckInStatus } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';
import type { ShowDayClass } from '@/types/show-day-types';

interface CheckInMutationInput {
  entryId: string;
  newStatus: CheckInStatus;
}

/**
 * Persist check-in status to Supabase.
 * Updates `entry_status` column (the unified status field used by both apps).
 */
async function updateCheckInStatus({ entryId, newStatus }: CheckInMutationInput): Promise<void> {
  const { error } = await supabase
    .from('entries')
    .update({ entry_status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', entryId);

  if (error) throw new Error(`Check-in update failed: ${error.message}`);
}

export function useCheckInMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCheckInStatus,

    onMutate: async ({ entryId, newStatus }) => {
      // Cancel in-flight showDayDetails queries to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.entries });

      // Snapshot previous cache for rollback
      const previousData = queryClient.getQueriesData<ShowDayClass[]>({
        queryKey: queryKeys.entries,
      });

      // Optimistically update any cached ShowDayClass arrays that contain this entry
      queryClient.setQueriesData<ShowDayClass[]>({ queryKey: queryKeys.entries }, old => {
        if (!old) return old;
        return old.map(cls => (cls.entryId === entryId ? { ...cls, entryStatus: newStatus } : cls));
      });

      return { previousData };
    },

    onError: (_err, _vars, context) => {
      // Roll back to previous cache state
      if (context?.previousData) {
        for (const [key, data] of context.previousData) {
          queryClient.setQueryData(key, data);
        }
      }
    },

    onSettled: () => {
      // Refetch to get server truth
      queryClient.invalidateQueries({ queryKey: queryKeys.entries });
    },
  });
}

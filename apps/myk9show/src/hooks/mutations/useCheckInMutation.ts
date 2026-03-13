/**
 * useCheckInMutation — Optimistic check-in status update via React Query.
 *
 * Updates the entry's check-in status in Supabase with optimistic UI update
 * on both the showDayDetails and entries query caches. Rolls back on failure.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CheckInStatus } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';
import type { ShowDayDetailRow } from '@/types/show-day-types';

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
      // Cancel in-flight queries to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: ['show-day'] });
      await queryClient.cancelQueries({ queryKey: queryKeys.entries });

      // Snapshot showDayDetails cache for rollback
      const previousShowDay = queryClient.getQueriesData<ShowDayDetailRow[]>({
        queryKey: ['show-day', 'details'],
      });

      // Snapshot entries cache for rollback
      const previousEntries = queryClient.getQueriesData({
        queryKey: queryKeys.entries,
      });

      // Optimistically update showDayDetails cache (ShowDayDetailRow uses entry_status)
      queryClient.setQueriesData<ShowDayDetailRow[]>({ queryKey: ['show-day', 'details'] }, old => {
        if (!old) return old;
        return old.map(row => (row.id === entryId ? { ...row, entry_status: newStatus } : row));
      });

      // Also update entries cache for non-show-day views
      queryClient.setQueriesData<Record<string, unknown>[]>(
        { queryKey: queryKeys.entries },
        old => {
          if (!old) return old;
          return old.map(row =>
            (row.id as string) === entryId ? { ...row, entry_status: newStatus } : row
          );
        }
      );

      return { previousShowDay, previousEntries };
    },

    onError: (_err, _vars, context) => {
      // Roll back to previous cache state
      if (context?.previousShowDay) {
        for (const [key, data] of context.previousShowDay) {
          queryClient.setQueryData(key, data);
        }
      }
      if (context?.previousEntries) {
        for (const [key, data] of context.previousEntries) {
          queryClient.setQueryData(key, data);
        }
      }
    },

    onSettled: () => {
      // Refetch to get server truth
      queryClient.invalidateQueries({ queryKey: ['show-day'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.entries });
    },
  });
}

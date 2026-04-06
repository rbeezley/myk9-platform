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
  classId?: string | undefined;
}

/**
 * Persist check-in status to Supabase via SECURITY DEFINER RPC.
 * Using RPC instead of direct UPDATE restricts handlers to check_in_status
 * only — the policy no longer allows handlers to update other columns.
 */
async function updateCheckInStatus({ entryId, newStatus }: CheckInMutationInput): Promise<void> {
  const { error } = await supabase.rpc('self_checkin_entry', {
    p_entry_id: entryId,
    p_new_status: newStatus,
  });

  if (error) throw new Error(`Check-in update failed: ${error.message}`);
}

export function useCheckInMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCheckInStatus,

    onMutate: async ({ entryId, newStatus, classId }) => {
      // Cancel in-flight queries to avoid overwriting our optimistic update
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['show-day'] }),
        queryClient.cancelQueries({ queryKey: queryKeys.entries }),
      ]);

      // Snapshot showDayDetails cache for rollback
      const previousShowDay = queryClient.getQueriesData<ShowDayDetailRow[]>({
        queryKey: ['show-day', 'details'],
      });

      // Snapshot entries cache for rollback
      const previousEntries = queryClient.getQueriesData({
        queryKey: queryKeys.entries,
      });

      // Snapshot class entries cache for rollback
      const previousClassEntries = classId
        ? queryClient.getQueriesData({
            queryKey: ['classes', classId, 'entries'],
          })
        : [];

      // Optimistically update showDayDetails cache
      queryClient.setQueriesData<ShowDayDetailRow[]>({ queryKey: ['show-day', 'details'] }, old => {
        if (!old) return old;
        return old.map(row => (row.id === entryId ? { ...row, check_in_status: newStatus } : row));
      });

      // Update entries cache for non-show-day views
      queryClient.setQueriesData<Record<string, unknown>[]>(
        { queryKey: queryKeys.entries },
        old => {
          if (!old) return old;
          return old.map(row =>
            (row.id as string) === entryId ? { ...row, check_in_status: newStatus } : row
          );
        }
      );

      // Optimistically update class entries cache (used by ClassResultsTable)
      if (classId) {
        queryClient.setQueriesData<Record<string, unknown>[]>(
          { queryKey: ['classes', classId, 'entries'] },
          old => {
            if (!old) return old;
            return old.map(row =>
              (row.id as string) === entryId ? { ...row, check_in_status: newStatus } : row
            );
          }
        );
      }

      return { previousShowDay, previousEntries, previousClassEntries };
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
      if (context?.previousClassEntries) {
        for (const [key, data] of context.previousClassEntries) {
          queryClient.setQueryData(key, data);
        }
      }
    },

    onSettled: (_data, _error, variables) => {
      // Refetch to get server truth
      queryClient.invalidateQueries({ queryKey: ['show-day'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.entries });
      // Also invalidate class entries (used by ClassResultsTable via useClassEntriesRaw)
      if (variables.classId) {
        queryClient.invalidateQueries({
          queryKey: ['classes', variables.classId, 'entries'],
        });
      }
    },
  });
}

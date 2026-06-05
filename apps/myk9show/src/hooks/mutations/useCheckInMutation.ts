/**
 * useCheckInMutation — Optimistic check-in status update via React Query.
 *
 * Uses optimistic UI updates on showDayDetails and entries caches. Staff flows
 * default to the narrow replicated writer. Exhibitor self check-in must opt into
 * `self-checkin-rpc` because direct `entries` UPDATE is manager-only under RLS;
 * the `self_checkin_entry` SECURITY DEFINER RPC preserves owner-scoped authority.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CheckInStatus } from '@myk9/core';
import { queryKeys } from '@/lib/queryClient';
import {
  updateReplicatedCheckInStatus,
  updateSelfCheckInStatus,
} from '@/services/show-day/checkInStatus';
import type { ShowDayDetailRow } from '@/types/show-day-types';

interface CheckInMutationInput {
  entryId: string;
  newStatus: CheckInStatus;
  classId?: string | undefined;
}

interface CheckInMutationContext {
  previousShowDay: [readonly unknown[], ShowDayDetailRow[] | undefined][];
  previousEntries: [readonly unknown[], unknown][];
  previousClassEntries: [readonly unknown[], unknown][];
}

export type CheckInWriter = 'replicated' | 'self-checkin-rpc';

interface UseCheckInMutationOptions {
  writer?: CheckInWriter | undefined;
}

async function updateCheckInStatus(
  { entryId, newStatus }: CheckInMutationInput,
  writer: CheckInWriter
): Promise<void> {
  try {
    if (writer === 'self-checkin-rpc') {
      await updateSelfCheckInStatus(entryId, newStatus);
      return;
    }

    await updateReplicatedCheckInStatus(entryId, newStatus);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Check-in update failed: ${message}`);
  }
}

export function useCheckInMutation(options: UseCheckInMutationOptions = {}) {
  const queryClient = useQueryClient();
  const writer = options.writer ?? 'replicated';

  return useMutation<void, Error, CheckInMutationInput, CheckInMutationContext>({
    mutationFn: input => updateCheckInStatus(input, writer),

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

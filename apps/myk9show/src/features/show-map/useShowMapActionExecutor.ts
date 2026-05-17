import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/queryClient';
import { getUserFriendlyError } from '@/utils/errorMessages';
import type { ExhibitorCheckInGroup } from '@/hooks/queries/useCheckInReport';
import type { ShowDayDetailRow } from '@/types/show-day-types';
import type { ShowMapAction } from './showMapActions';
import type { ExecutableShowMapActionExecution } from './showMapActionExecution';
import {
  markShowMapEntryCheckedIn,
  sourceIdFromShowMapNodeId,
} from './showMapActionMutations';

interface UseShowMapActionExecutorInput {
  showId: string;
}

interface MutationInput {
  action: ShowMapAction;
  execution: Extract<ExecutableShowMapActionExecution, { kind: 'mutation' }>;
}

function markRowCheckedIn<T extends Record<string, unknown>>(rows: T[] | undefined, entryId: string) {
  if (!rows) return rows;
  return rows.map(row =>
    row.id === entryId ? { ...row, check_in_status: 'checked-in' } : row
  ) as T[];
}

function markShowDayDetailsCheckedIn(
  rows: ShowDayDetailRow[] | undefined,
  entryId: string
): ShowDayDetailRow[] | undefined {
  if (!rows) return rows;
  return rows.map(row =>
    row.id === entryId ? { ...row, check_in_status: 'checked-in' } : row
  );
}

function markCheckInReportCheckedIn(
  groups: ExhibitorCheckInGroup[] | undefined,
  entryId: string
): ExhibitorCheckInGroup[] | undefined {
  if (!groups) return groups;
  return groups.map(group => {
    if (!group.entries.some(entry => entry.entryId === entryId)) return group;

    const entries = group.entries.map(entry =>
      entry.entryId === entryId ? { ...entry, checkInStatus: 'checked-in' } : entry
    );
    const checkedInCount = entries.filter(
      entry => entry.checkInStatus !== 'no-status' && !!entry.checkInStatus
    ).length;
    const allCheckedIn = checkedInCount === entries.length;
    const noneCheckedIn = checkedInCount === 0;

    return {
      ...group,
      entries,
      checkedInCount,
      summaryStatus: allCheckedIn ? 'checked-in' : noneCheckedIn ? 'none' : 'partial',
    };
  });
}

export function useShowMapActionExecutor({ showId }: UseShowMapActionExecutorInput) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ action, execution }: MutationInput) => {
      if (execution.mutation !== 'mark-checked-in') return;

      const entryId = sourceIdFromShowMapNodeId(action.nodeId, 'entry');
      if (!entryId) throw new Error('Unable to find the entry for this action.');

      await markShowMapEntryCheckedIn(entryId);
    },
    onMutate: async ({ action, execution }) => {
      if (execution.mutation !== 'mark-checked-in') return {};

      const entryId = sourceIdFromShowMapNodeId(action.nodeId, 'entry');
      if (!entryId) return {};

      const classId = action.classId;
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.showEntries(showId) }),
        queryClient.cancelQueries({ queryKey: queryKeys.entries }),
        queryClient.cancelQueries({ queryKey: queryKeys.checkInReport(showId) }),
        queryClient.cancelQueries({ queryKey: ['show-day'] }),
        ...(classId
          ? [
              queryClient.cancelQueries({ queryKey: queryKeys.classEntries(classId) }),
              queryClient.cancelQueries({ queryKey: ['classes', classId, 'entries'] }),
            ]
          : []),
      ]);

      const previousShowEntries = queryClient.getQueryData<Record<string, unknown>[]>(
        queryKeys.showEntries(showId)
      );
      const previousEntries = queryClient.getQueriesData<Record<string, unknown>[]>({
        queryKey: queryKeys.entries,
      });
      const previousCheckInReport = queryClient.getQueryData<ExhibitorCheckInGroup[]>(
        queryKeys.checkInReport(showId)
      );
      const previousShowDayDetails = queryClient.getQueriesData<ShowDayDetailRow[]>({
        queryKey: ['show-day', 'details'],
      });
      const previousClassEntries = classId
        ? queryClient.getQueryData<Record<string, unknown>[]>(queryKeys.classEntries(classId))
        : undefined;
      const previousLegacyClassEntries = classId
        ? queryClient.getQueriesData<Record<string, unknown>[]>({
            queryKey: ['classes', classId, 'entries'],
          })
        : [];

      queryClient.setQueryData<Record<string, unknown>[]>(
        queryKeys.showEntries(showId),
        rows => markRowCheckedIn(rows, entryId)
      );
      queryClient.setQueriesData<Record<string, unknown>[]>(
        { queryKey: queryKeys.entries },
        rows => markRowCheckedIn(rows, entryId)
      );
      queryClient.setQueryData<ExhibitorCheckInGroup[]>(
        queryKeys.checkInReport(showId),
        groups => markCheckInReportCheckedIn(groups, entryId)
      );
      queryClient.setQueriesData<ShowDayDetailRow[]>(
        { queryKey: ['show-day', 'details'] },
        rows => markShowDayDetailsCheckedIn(rows, entryId)
      );
      if (classId) {
        queryClient.setQueryData<Record<string, unknown>[]>(
          queryKeys.classEntries(classId),
          rows => markRowCheckedIn(rows, entryId)
        );
        queryClient.setQueriesData<Record<string, unknown>[]>(
          { queryKey: ['classes', classId, 'entries'] },
          rows => markRowCheckedIn(rows, entryId)
        );
      }

      return {
        previousShowEntries,
        previousEntries,
        previousCheckInReport,
        previousShowDayDetails,
        previousClassEntries,
        previousLegacyClassEntries,
      };
    },
    onSuccess: (_data, { execution }) => {
      toast.success(execution.successMessage);
    },
    onError: (error, _variables, context) => {
      if (context?.previousShowEntries) {
        queryClient.setQueryData(queryKeys.showEntries(showId), context.previousShowEntries);
      }
      if (context?.previousEntries) {
        for (const [key, data] of context.previousEntries) {
          queryClient.setQueryData(key, data);
        }
      }
      if (context?.previousCheckInReport) {
        queryClient.setQueryData(queryKeys.checkInReport(showId), context.previousCheckInReport);
      }
      if (context?.previousShowDayDetails) {
        for (const [key, data] of context.previousShowDayDetails) {
          queryClient.setQueryData(key, data);
        }
      }
      if (context?.previousClassEntries && _variables.action.classId) {
        queryClient.setQueryData(
          queryKeys.classEntries(_variables.action.classId),
          context.previousClassEntries
        );
      }
      if (context?.previousLegacyClassEntries) {
        for (const [key, data] of context.previousLegacyClassEntries) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error(getUserFriendlyError(error));
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.showEntries(showId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.checkInReport(showId) });
      queryClient.invalidateQueries({ queryKey: ['show-day'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.entries });
      if (variables?.action.classId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.classEntries(variables.action.classId) });
        queryClient.invalidateQueries({
          queryKey: ['classes', variables.action.classId, 'entries'],
        });
      }
    },
  });

  const executeAction = useCallback(
    (action: ShowMapAction, execution: ExecutableShowMapActionExecution) => {
      if (execution.kind === 'mutation') {
        mutation.mutate({ action, execution });
      }
    },
    [mutation]
  );

  return {
    executeAction,
    isExecuting: mutation.isPending,
  };
}
